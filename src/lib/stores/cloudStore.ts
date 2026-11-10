import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Archive, Mix, MixInput, OwnedPaint, Paint, PaintStatus, Project, ProjectPhoto, Recipe, RecipeStep } from "../../types";
import { StoreError } from "../errors";
import { imageToDataUrl } from "../images";
import { requireSupabase } from "../supabase";
import { UUID_PATTERN, paintKey, uniqueName } from "../validation";
import type { ArchiveStore } from "./types";

// Mixes, collections, recipes, projects, paints and photos in Supabase. Cloud mixes carry imagePath,
// the photo's location in the private mix-photos bucket; their `image` is a temporary signed link to
// that photo. Project photos work the same way.

const BUCKET = "mix-photos";
const PHOTO_LINK_SECONDS = 60 * 60 * 24; // refreshed every time the archive loads
const SCHEMA_WARNING = "Recipes, projects and My paints need a database update. Run the latest supabase/schema.sql in your Supabase project.";

interface MixRow {
  id: string;
  name: string;
  color: string;
  notes: string;
  paints: Paint[] | null;
  image_path: string | null;
  favorite?: boolean | null;
  created_at: string;
}

interface PaintRow { id: string; name: string; brand: string; swatch: string; status: PaintStatus; created_at: string }
interface RecipeRow { id: string; name: string; notes: string; steps: RecipeStep[] | null; created_at: string }
interface PhotoEntry { id: string; path: string; caption: string; added_at: string }
interface ProjectRow {
  id: string;
  name: string;
  notes: string;
  recipe_ids: string[] | null;
  mix_ids: string[] | null;
  photos: PhotoEntry[] | null;
  created_at: string;
}

/** For queries that return data: throws a StoreError on failure, otherwise returns the data. */
function check<T>(result: { data: T | null; error: PostgrestError | Error | null }, message: string): T {
  if (result.error) throw new StoreError(message, result.error);
  if (result.data === null) throw new StoreError(message);
  return result.data;
}

/** For writes that return nothing: throws a StoreError on failure. */
function ok(result: { error: PostgrestError | Error | null }, message: string): void {
  if (result.error) throw new StoreError(message, result.error);
}

/** True when the database hasn't had the update that adds a table or column yet. */
function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST205" || code === "PGRST204" || code === "42P01" || code === "42703";
}

/** Throws a StoreError that says to run the schema update when that's what went wrong. */
function fail(message: string, error: PostgrestError | Error): never {
  if (isMissingSchema(error)) throw new StoreError(SCHEMA_WARNING);
  throw new StoreError(message, error);
}

const toMix = (row: MixRow, links: Record<string, string | undefined>): Mix => ({
  id: row.id,
  name: row.name,
  color: row.color,
  notes: row.notes,
  paints: Array.isArray(row.paints) ? row.paints : [],
  image: (row.image_path && links[row.image_path]) || "",
  imagePath: row.image_path || null,
  favorite: Boolean(row.favorite),
  createdAt: row.created_at,
});

const toRow = (mix: MixInput) => ({
  name: mix.name,
  color: mix.color,
  notes: mix.notes || "",
  paints: mix.paints.map(({ name, brand, drops, swatch }) => ({ name, brand, drops: String(drops), swatch })),
});

const toPaint = (row: PaintRow): OwnedPaint => ({ id: row.id, name: row.name, brand: row.brand, swatch: row.swatch, status: row.status, createdAt: row.created_at });
const paintRow = ({ name, brand, swatch, status }: OwnedPaint | Omit<OwnedPaint, "id" | "createdAt">) => ({ name, brand, swatch, status });

const toRecipe = (row: RecipeRow): Recipe => ({
  id: row.id,
  name: row.name,
  notes: row.notes,
  steps: Array.isArray(row.steps) ? row.steps : [],
  createdAt: row.created_at,
});
const stepRows = (steps: RecipeStep[]) => steps.map(({ role, mixId, paint, note }) => ({ role, mixId, paint, note }));

const toProject = (row: ProjectRow, links: Record<string, string | undefined>): Project => ({
  id: row.id,
  name: row.name,
  notes: row.notes,
  recipeIds: Array.isArray(row.recipe_ids) ? row.recipe_ids : [],
  mixIds: Array.isArray(row.mix_ids) ? row.mix_ids : [],
  photos: (Array.isArray(row.photos) ? row.photos : []).map((photo) => ({
    id: photo.id,
    image: links[photo.path] || "",
    path: photo.path,
    caption: photo.caption,
    addedAt: photo.added_at,
  })),
  createdAt: row.created_at,
});
const photoEntries = (photos: ProjectPhoto[]): PhotoEntry[] => photos.flatMap((photo) => (photo.path
  ? [{ id: photo.id, path: photo.path, caption: photo.caption, added_at: photo.addedAt }]
  : []));

/**
 * Same source id → same cloud id for one person, so importing a backup twice skips what it already
 * added, and two people importing one file never collide.
 */
export async function cloudIdFor(userId: string, sourceId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${sourceId}`));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function inBatches<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) await Promise.all(items.slice(start, start + size).map(task));
}

/** Only well-formed ids may reach a query filter. */
function requireIds(ids: (string | null | undefined)[], message: string): void {
  if (!ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id))) throw new StoreError(message);
}

export function createCloudStore(userId: string, client: SupabaseClient = requireSupabase()): ArchiveStore {
  const photos = () => client.storage.from(BUCKET);

  async function photoLinks(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const data = check(await photos().createSignedUrls(paths, PHOTO_LINK_SECONDS), "Photo links could not be created.");
    return Object.fromEntries(data.flatMap((item) => (item.signedUrl && item.path ? [[item.path, item.signedUrl]] : [])));
  }

  /** Uploads a data URL into this person's folder. `name` starts the file name, e.g. a mix id. */
  async function uploadPhoto(name: string, dataUrl: string): Promise<string> {
    const blob = await (await fetch(dataUrl)).blob();
    const extension = ({ "image/png": "png", "image/webp": "webp" } as Record<string, string>)[blob.type] || "jpg";
    // A new file name for every upload, so a replaced photo never shows a cached copy.
    const path = `${userId}/${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${extension}`;
    ok(await photos().upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false }), "The photo could not be uploaded.");
    return path;
  }

  async function removePhotos(paths: (string | null | undefined)[]): Promise<void> {
    const list = paths.filter((path): path is string => Boolean(path));
    if (!list.length) return;
    const { error } = await photos().remove(list);
    // A leftover photo file is harmless, so a failed clean-up is only logged.
    if (error) console.error("Could not remove old photos:", error);
  }

  /** Loads a list added by a later schema update; a database without it yet gives an empty list. */
  async function optionalRows<T>(table: string, message: string): Promise<{ rows: T[]; missing: boolean }> {
    const result = await client.from(table).select("*").order("created_at", { ascending: false });
    if (result.error && isMissingSchema(result.error)) return { rows: [], missing: true };
    const rows = check(result, message);
    if (!Array.isArray(rows)) throw new StoreError(message);
    return { rows: rows as T[], missing: false };
  }

  async function load(): Promise<{ archive: Archive; warning: string }> {
    const [mixRows, collectionRows, linkRows, paintRows, recipeRows, projectRows] = await Promise.all([
      client.from("mixes").select("*").order("created_at", { ascending: false }).then((result) => check(result, "Your mixes could not be loaded.") as MixRow[]),
      client.from("collections").select("*").order("created_at").then((result) => check(result, "Your collections could not be loaded.") as { id: string; name: string; created_at: string }[]),
      client.from("collection_mixes").select("collection_id, mix_id, added_at").order("added_at").then((result) => check(result, "Your collections could not be loaded.") as { collection_id: string; mix_id: string }[]),
      optionalRows<PaintRow>("paints", "Your paints could not be loaded."),
      optionalRows<RecipeRow>("recipes", "Your recipes could not be loaded."),
      optionalRows<ProjectRow>("projects", "Your projects could not be loaded."),
    ]);
    const projectPhotoPaths = projectRows.rows.flatMap((row) => (Array.isArray(row.photos) ? row.photos.map((photo) => photo.path) : []));
    const links = await photoLinks([...mixRows.flatMap((row) => (row.image_path ? [row.image_path] : [])), ...projectPhotoPaths]);
    const mixIdsByCollection = new Map<string, string[]>();
    for (const link of linkRows) mixIdsByCollection.set(link.collection_id, [...(mixIdsByCollection.get(link.collection_id) || []), link.mix_id]);
    return {
      archive: {
        mixes: mixRows.map((row) => toMix(row, links)),
        collections: collectionRows.map((row) => ({ id: row.id, name: row.name, mixIds: mixIdsByCollection.get(row.id) || [], createdAt: row.created_at })),
        paints: paintRows.rows.map(toPaint).reverse(),
        recipes: recipeRows.rows.map(toRecipe),
        projects: projectRows.rows.map((row) => toProject(row, links)),
      },
      warning: paintRows.missing || recipeRows.missing || projectRows.missing ? SCHEMA_WARNING : "",
    };
  }

  async function clearArchive(): Promise<void> {
    const message = "Your archive could not be replaced.";
    // Removing mixes and collections also removes every link between them.
    ok(await client.from("collections").delete().eq("user_id", userId), message);
    ok(await client.from("mixes").delete().eq("user_id", userId), message);
    for (const table of ["projects", "recipes", "paints"]) {
      const result = await client.from(table).delete().eq("user_id", userId);
      if (result.error && !isMissingSchema(result.error)) throw new StoreError(message, result.error);
    }
    const files = check(await photos().list(userId, { limit: 1000 }), message);
    await removePhotos(files.map((file) => `${userId}/${file.name}`));
  }

  async function writeProjectPhotos(project: Project, nextPhotos: ProjectPhoto[], message: string): Promise<Project> {
    requireIds([project.id], message);
    const result = await client.from("projects").update({ photos: photoEntries(nextPhotos) }).eq("id", project.id).select().single();
    if (result.error) fail(message, result.error);
    return { ...toProject(result.data as ProjectRow, {}), photos: nextPhotos };
  }

  return {
    kind: "cloud",

    load,

    async saveMix(values, existing) {
      const id = existing?.id || crypto.randomUUID();
      let imagePath = existing?.imagePath || null;
      let uploadedPath: string | null = null;
      let replacedPath: string | null = null;

      if (values.image.startsWith("data:")) {
        uploadedPath = await uploadPhoto(id, values.image);
        replacedPath = imagePath;
        imagePath = uploadedPath;
      } else if (!values.image && imagePath) {
        replacedPath = imagePath;
        imagePath = null;
      }

      const row = { ...toRow(values), image_path: imagePath };
      const query = existing
        ? client.from("mixes").update(row).eq("id", id)
        : client.from("mixes").insert({ ...row, id });
      const result = await query.select().single();
      if (result.error) {
        await removePhotos([uploadedPath]);
        throw new StoreError("The mix could not be saved.", result.error);
      }
      await removePhotos([replacedPath]);
      const links = uploadedPath ? await photoLinks([uploadedPath]) : { [imagePath || ""]: existing?.image };
      return toMix(result.data as MixRow, links);
    },

    async setFavorite(mix, favorite) {
      requireIds([mix.id], "The mix could not be updated.");
      const result = await client.from("mixes").update({ favorite }).eq("id", mix.id).select().single();
      if (result.error) fail("The mix could not be updated.", result.error);
      return toMix(result.data as MixRow, { [mix.imagePath || ""]: mix.image });
    },

    async deleteMix(mix) {
      ok(await client.from("mixes").delete().eq("id", mix.id), "The mix could not be deleted.");
      await removePhotos([mix.imagePath]);
    },

    async saveCollection(values, existing) {
      // Only well-formed ids may reach a query filter. supabase-js quotes list values but does not
      // escape a `"` inside one, so a malformed id could otherwise widen the in() list below.
      if (![existing?.id, ...values.mixIds, ...(existing?.mixIds || [])].filter(Boolean).every((id) => UUID_PATTERN.test(String(id)))) {
        throw new StoreError("The collection contains an invalid mix reference.");
      }
      let row: { id: string; name: string; created_at: string };
      if (existing) {
        row = check(await client.from("collections").update({ name: values.name }).eq("id", existing.id).select().single(), "The collection could not be saved.");
        const removed = existing.mixIds.filter((id) => !values.mixIds.includes(id));
        const added = values.mixIds.filter((id) => !existing.mixIds.includes(id));
        if (removed.length) {
          ok(await client.from("collection_mixes").delete().eq("collection_id", existing.id).in("mix_id", removed), "The collection could not be saved.");
        }
        if (added.length) {
          ok(await client.from("collection_mixes").insert(added.map((mixId) => ({ collection_id: existing.id, mix_id: mixId }))), "The collection could not be saved.");
        }
      } else {
        row = check(await client.from("collections").insert({ name: values.name }).select().single(), "The collection could not be created.");
        if (values.mixIds.length) {
          const links = await client.from("collection_mixes").insert(values.mixIds.map((mixId) => ({ collection_id: row.id, mix_id: mixId })));
          if (links.error) {
            await client.from("collections").delete().eq("id", row.id);
            throw new StoreError("The collection could not be created.", links.error);
          }
        }
      }
      return { id: row.id, name: row.name, mixIds: [...values.mixIds], createdAt: row.created_at };
    },

    async deleteCollection(id) {
      ok(await client.from("collections").delete().eq("id", id), "The collection could not be deleted.");
    },

    async saveRecipe(values, existing) {
      const message = "The recipe could not be saved.";
      const row = { name: values.name, notes: values.notes, steps: stepRows(values.steps) };
      if (existing) requireIds([existing.id], message);
      const result = existing
        ? await client.from("recipes").update(row).eq("id", existing.id).select().single()
        : await client.from("recipes").insert(row).select().single();
      if (result.error) fail(message, result.error);
      return toRecipe(result.data as RecipeRow);
    },

    async deleteRecipe(id) {
      requireIds([id], "The recipe could not be deleted.");
      const result = await client.from("recipes").delete().eq("id", id);
      if (result.error) fail("The recipe could not be deleted.", result.error);
    },

    async saveProject(values, existing) {
      const message = "The project could not be saved.";
      const row = { name: values.name, notes: values.notes, recipe_ids: values.recipeIds, mix_ids: values.mixIds };
      if (existing) requireIds([existing.id], message);
      const result = existing
        ? await client.from("projects").update(row).eq("id", existing.id).select().single()
        : await client.from("projects").insert({ ...row, photos: [] }).select().single();
      if (result.error) fail(message, result.error);
      // The photos' links are already on screen; keep them rather than signing them again.
      return { ...toProject(result.data as ProjectRow, {}), photos: existing?.photos || [] };
    },

    async deleteProject(project) {
      requireIds([project.id], "The project could not be deleted.");
      const result = await client.from("projects").delete().eq("id", project.id);
      if (result.error) fail("The project could not be deleted.", result.error);
      await removePhotos(project.photos.map((photo) => photo.path));
    },

    async addProjectPhoto(project, image, caption) {
      const path = await uploadPhoto(`project-${project.id}`, image);
      const photo: ProjectPhoto = { id: crypto.randomUUID(), image: "", path, caption, addedAt: new Date().toISOString() };
      try {
        const saved = await writeProjectPhotos(project, [...project.photos, photo], "The photo could not be saved.");
        const links = await photoLinks([path]);
        return { ...saved, photos: saved.photos.map((item) => (item.id === photo.id ? { ...item, image: links[path] || image } : item)) };
      } catch (error) {
        await removePhotos([path]);
        throw error;
      }
    },

    async removeProjectPhoto(project, photoId) {
      const removed = project.photos.find((photo) => photo.id === photoId);
      const saved = await writeProjectPhotos(project, project.photos.filter((photo) => photo.id !== photoId), "The photo could not be removed.");
      await removePhotos([removed?.path]);
      return saved;
    },

    async savePaint(values, existing) {
      const message = "The paint could not be saved.";
      if (existing) requireIds([existing.id], message);
      const result = existing
        ? await client.from("paints").update(paintRow(values)).eq("id", existing.id).select().single()
        : await client.from("paints").insert(paintRow(values)).select().single();
      if (result.error) {
        if (result.error.code === "23505") throw new StoreError("That paint is already on your list.");
        fail(message, result.error);
      }
      return toPaint(result.data as PaintRow);
    },

    async deletePaint(id) {
      requireIds([id], "The paint could not be removed.");
      const result = await client.from("paints").delete().eq("id", id);
      if (result.error) fail("The paint could not be removed.", result.error);
    },

    async importArchive(archive, { mode, label }) {
      if (mode === "replace") await clearArchive();

      const existing = { mixes: new Set<string>(), recipes: new Set<string>(), projects: new Set<string>(), paints: new Set<string>() };
      const existingCollections: { id: string; name: string }[] = [];
      const knownPaints = new Set<string>();
      if (mode !== "replace") {
        const checkMessage = "Your archive could not be checked.";
        const [mixRows, collectionRows, recipeRows, projectRows, paintRows] = await Promise.all([
          client.from("mixes").select("id").then((result) => check(result, checkMessage) as { id: string }[]),
          client.from("collections").select("id, name").then((result) => check(result, checkMessage) as { id: string; name: string }[]),
          optionalRows<{ id: string }>("recipes", checkMessage),
          optionalRows<{ id: string }>("projects", checkMessage),
          optionalRows<PaintRow>("paints", checkMessage),
        ]);
        mixRows.forEach((row) => existing.mixes.add(row.id));
        existingCollections.push(...collectionRows);
        recipeRows.rows.forEach((row) => existing.recipes.add(row.id));
        projectRows.rows.forEach((row) => existing.projects.add(row.id));
        paintRows.rows.forEach((row) => {
          existing.paints.add(row.id);
          knownPaints.add(paintKey(row.brand, row.name));
        });
      }

      /** This account's id for an incoming item: its own id if it's already here, else a stable new one. */
      const cloudId = async (kind: string, id: string, known: Set<string>) => (UUID_PATTERN.test(id) && known.has(id)
        ? id
        : cloudIdFor(userId, kind ? `${kind}:${id}` : id));

      // Work out each incoming mix's cloud id, skipping mixes this account already has.
      const idMap = new Map<string, string>();
      const newMixes: { mix: Mix; id: string }[] = [];
      for (const mix of archive.mixes) {
        const ownId = await cloudId("", mix.id, existing.mixes);
        idMap.set(mix.id, ownId);
        if (existing.mixes.has(ownId)) continue;
        existing.mixes.add(ownId);
        newMixes.push({ mix, id: ownId });
      }

      const uploaded: string[] = [];
      try {
        const rows: Record<string, unknown>[] = [];
        await inBatches(newMixes, 4, async ({ mix, id }) => {
          const imagePath = mix.image?.startsWith("data:") ? await uploadPhoto(id, mix.image) : null;
          if (imagePath) uploaded.push(imagePath);
          rows.push({ ...toRow(mix), id, image_path: imagePath, created_at: mix.createdAt || new Date().toISOString() });
        });
        for (let start = 0; start < rows.length; start += 200) {
          ok(await client.from("mixes").insert(rows.slice(start, start + 200)), "The mixes could not be imported.");
        }
      } catch (error) {
        await removePhotos(uploaded);
        throw error;
      }
      // Favourites are set separately, so a database without the favourite column still imports.
      const favorites = newMixes.filter(({ mix }) => mix.favorite).map(({ id }) => id);
      if (favorites.length) {
        const result = await client.from("mixes").update({ favorite: true }).in("id", favorites);
        if (result.error && !isMissingSchema(result.error)) throw new StoreError("The mixes could not be imported.", result.error);
      }

      const existingCollectionIds = new Set(existingCollections.map((collection) => collection.id));
      const takenNames = existingCollections.map((collection) => collection.name);
      let addedCollections = 0;
      for (const collection of archive.collections) {
        const id = await cloudId("collection", collection.id, existingCollectionIds);
        if (!existingCollectionIds.has(id)) {
          const name = uniqueName(collection.name, label, takenNames);
          ok(await client.from("collections").insert({ id, name, created_at: collection.createdAt || new Date().toISOString() }), "A collection could not be imported.");
          existingCollectionIds.add(id);
          takenNames.push(name);
          addedCollections += 1;
        }
        const links = collection.mixIds.flatMap((mixId) => {
          const mixCloudId = idMap.get(mixId);
          return mixCloudId ? [{ collection_id: id, mix_id: mixCloudId }] : [];
        });
        if (links.length) {
          ok(await client.from("collection_mixes").upsert(links, { onConflict: "collection_id,mix_id", ignoreDuplicates: true }), "A collection could not be imported.");
        }
      }

      let addedOther = 0;
      const insertRows = async (table: string, rows: Record<string, unknown>[], message: string) => {
        if (!rows.length) return;
        const result = await client.from(table).insert(rows);
        if (result.error) fail(message, result.error);
        addedOther += rows.length;
      };

      const paintRows: Record<string, unknown>[] = [];
      for (const paint of archive.paints) {
        const id = await cloudId("paint", paint.id, existing.paints);
        const key = paintKey(paint.brand, paint.name);
        if (existing.paints.has(id) || knownPaints.has(key)) continue;
        existing.paints.add(id);
        knownPaints.add(key);
        paintRows.push({ ...paintRow(paint), id, created_at: paint.createdAt });
      }
      await insertRows("paints", paintRows, "Your paints could not be imported.");

      const recipeIdMap = new Map<string, string>();
      const recipeRows: Record<string, unknown>[] = [];
      for (const recipe of archive.recipes) {
        const id = await cloudId("recipe", recipe.id, existing.recipes);
        recipeIdMap.set(recipe.id, id);
        if (existing.recipes.has(id)) continue;
        existing.recipes.add(id);
        const steps = recipe.steps.map((step) => ({ ...step, mixId: step.mixId ? idMap.get(step.mixId) ?? null : null }));
        recipeRows.push({ id, name: recipe.name, notes: recipe.notes, steps: stepRows(steps), created_at: recipe.createdAt });
      }
      await insertRows("recipes", recipeRows, "Your recipes could not be imported.");

      const projectUploads: string[] = [];
      try {
        const projectRows: Record<string, unknown>[] = [];
        for (const project of archive.projects) {
          const id = await cloudId("project", project.id, existing.projects);
          if (existing.projects.has(id)) continue;
          existing.projects.add(id);
          const entries: PhotoEntry[] = [];
          for (const photo of project.photos) {
            if (!photo.image.startsWith("data:")) continue;
            const path = await uploadPhoto(`project-${id}`, photo.image);
            projectUploads.push(path);
            entries.push({ id: photo.id, path, caption: photo.caption, added_at: photo.addedAt });
          }
          projectRows.push({
            id,
            name: project.name,
            notes: project.notes,
            recipe_ids: project.recipeIds.flatMap((recipeId) => recipeIdMap.get(recipeId) ?? []),
            mix_ids: project.mixIds.flatMap((mixId) => idMap.get(mixId) ?? []),
            photos: entries,
            created_at: project.createdAt,
          });
        }
        await insertRows("projects", projectRows, "Your projects could not be imported.");
      } catch (error) {
        await removePhotos(projectUploads);
        throw error;
      }

      return {
        archive: (await load()).archive,
        addedMixes: newMixes.length,
        skippedMixes: archive.mixes.length - newMixes.length,
        addedCollections,
        addedOther,
      };
    },

    async prepareExport(archive) {
      const embed = (image: string) => (image && !image.startsWith("data:") ? imageToDataUrl(image) : Promise.resolve(image));
      return {
        ...archive,
        mixes: await Promise.all(archive.mixes.map(async (mix) => ({ ...mix, image: await embed(mix.image) }))),
        projects: await Promise.all(archive.projects.map(async (project) => ({
          ...project,
          photos: await Promise.all(project.photos.map(async (photo) => ({ ...photo, image: await embed(photo.image) }))),
        }))),
      };
    },
  };
}
