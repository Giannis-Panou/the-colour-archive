import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Archive, Mix, MixInput, Paint } from "../../types";
import { StoreError } from "../errors";
import { imageToDataUrl } from "../images";
import { requireSupabase } from "../supabase";
import { UUID_PATTERN, uniqueName } from "../validation";
import type { ArchiveStore } from "./types";

// Mixes, collections and photos in Supabase. Cloud mixes carry imagePath, the photo's location in
// the private mix-photos bucket; their `image` is a temporary signed link to that photo.

const BUCKET = "mix-photos";
const PHOTO_LINK_SECONDS = 60 * 60 * 24; // refreshed every time the archive loads

interface MixRow {
  id: string;
  name: string;
  color: string;
  notes: string;
  paints: Paint[] | null;
  image_path: string | null;
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

const toMix = (row: MixRow, links: Record<string, string | undefined>): Mix => ({
  id: row.id,
  name: row.name,
  color: row.color,
  notes: row.notes,
  paints: Array.isArray(row.paints) ? row.paints : [],
  image: (row.image_path && links[row.image_path]) || "",
  imagePath: row.image_path || null,
  createdAt: row.created_at,
});

const toRow = (mix: MixInput) => ({
  name: mix.name,
  color: mix.color,
  notes: mix.notes || "",
  paints: mix.paints.map(({ name, brand, drops, swatch }) => ({ name, brand, drops: String(drops), swatch })),
});

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

export function createCloudStore(userId: string, client: SupabaseClient = requireSupabase()): ArchiveStore {
  const photos = () => client.storage.from(BUCKET);

  async function photoLinks(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const data = check(await photos().createSignedUrls(paths, PHOTO_LINK_SECONDS), "Photo links could not be created.");
    return Object.fromEntries(data.flatMap((item) => (item.signedUrl && item.path ? [[item.path, item.signedUrl]] : [])));
  }

  async function uploadPhoto(mixId: string, dataUrl: string): Promise<string> {
    const blob = await (await fetch(dataUrl)).blob();
    const extension = ({ "image/png": "png", "image/webp": "webp" } as Record<string, string>)[blob.type] || "jpg";
    // A new file name for every upload, so a replaced photo never shows a cached copy.
    const path = `${userId}/${mixId}-${Date.now().toString(36)}.${extension}`;
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

  async function load(): Promise<Archive> {
    const [mixRows, collectionRows, linkRows] = await Promise.all([
      client.from("mixes").select("*").order("created_at", { ascending: false }).then((result) => check(result, "Your mixes could not be loaded.") as MixRow[]),
      client.from("collections").select("*").order("created_at").then((result) => check(result, "Your collections could not be loaded.") as { id: string; name: string; created_at: string }[]),
      client.from("collection_mixes").select("collection_id, mix_id, added_at").order("added_at").then((result) => check(result, "Your collections could not be loaded.") as { collection_id: string; mix_id: string }[]),
    ]);
    const links = await photoLinks(mixRows.flatMap((row) => (row.image_path ? [row.image_path] : [])));
    const mixIdsByCollection = new Map<string, string[]>();
    for (const link of linkRows) mixIdsByCollection.set(link.collection_id, [...(mixIdsByCollection.get(link.collection_id) || []), link.mix_id]);
    return {
      mixes: mixRows.map((row) => toMix(row, links)),
      collections: collectionRows.map((row) => ({ id: row.id, name: row.name, mixIds: mixIdsByCollection.get(row.id) || [], createdAt: row.created_at })),
    };
  }

  async function clearArchive(): Promise<void> {
    // Removing mixes and collections also removes every link between them.
    ok(await client.from("collections").delete().eq("user_id", userId), "Your archive could not be replaced.");
    ok(await client.from("mixes").delete().eq("user_id", userId), "Your archive could not be replaced.");
    const files = check(await photos().list(userId, { limit: 1000 }), "Your archive could not be replaced.");
    await removePhotos(files.map((file) => `${userId}/${file.name}`));
  }

  return {
    kind: "cloud",

    async load() {
      return { archive: await load(), warning: "" };
    },

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

    async importArchive(archive, { mode, label }) {
      if (mode === "replace") await clearArchive();

      const existingMixIds = new Set<string>();
      const existingCollections: { id: string; name: string }[] = [];
      if (mode !== "replace") {
        const [mixRows, collectionRows] = await Promise.all([
          client.from("mixes").select("id").then((result) => check(result, "Your archive could not be checked.") as { id: string }[]),
          client.from("collections").select("id, name").then((result) => check(result, "Your archive could not be checked.") as { id: string; name: string }[]),
        ]);
        mixRows.forEach((row) => existingMixIds.add(row.id));
        existingCollections.push(...collectionRows);
      }

      // Work out each incoming mix's cloud id, skipping mixes this account already has.
      const idMap = new Map<string, string>();
      const newMixes: { mix: Mix; id: string }[] = [];
      for (const mix of archive.mixes) {
        const ownId = UUID_PATTERN.test(mix.id) && existingMixIds.has(mix.id) ? mix.id : await cloudIdFor(userId, mix.id);
        idMap.set(mix.id, ownId);
        if (existingMixIds.has(ownId)) continue;
        existingMixIds.add(ownId);
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

      const existingCollectionIds = new Set(existingCollections.map((collection) => collection.id));
      const takenNames = existingCollections.map((collection) => collection.name);
      let addedCollections = 0;
      for (const collection of archive.collections) {
        const id = UUID_PATTERN.test(collection.id) && existingCollectionIds.has(collection.id)
          ? collection.id
          : await cloudIdFor(userId, `collection:${collection.id}`);
        if (!existingCollectionIds.has(id)) {
          const name = uniqueName(collection.name, label, takenNames);
          ok(await client.from("collections").insert({ id, name, created_at: collection.createdAt || new Date().toISOString() }), "A collection could not be imported.");
          existingCollectionIds.add(id);
          takenNames.push(name);
          addedCollections += 1;
        }
        const links = collection.mixIds.flatMap((mixId) => {
          const cloudId = idMap.get(mixId);
          return cloudId ? [{ collection_id: id, mix_id: cloudId }] : [];
        });
        if (links.length) {
          ok(await client.from("collection_mixes").upsert(links, { onConflict: "collection_id,mix_id", ignoreDuplicates: true }), "A collection could not be imported.");
        }
      }

      return { archive: await load(), addedMixes: newMixes.length, skippedMixes: archive.mixes.length - newMixes.length, addedCollections };
    },

    async prepareExport(archive) {
      return {
        ...archive,
        mixes: await Promise.all(archive.mixes.map(async (mix) => ({
          ...mix,
          image: mix.image && !mix.image.startsWith("data:") ? await imageToDataUrl(mix.image) : mix.image,
        }))),
      };
    },
  };
}

