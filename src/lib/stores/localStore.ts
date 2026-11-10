import type { Archive, Mix, OwnedPaint, Project, Recipe } from "../../types";
import { StoreError } from "../errors";
import { isStoredMix, isValidCollection, isValidOwnedPaint, isValidProject, isValidRecipe, paintKey, plural, uniqueName } from "../validation";
import type { ArchiveStore } from "./types";

export const MIXES_KEY = "the-colour-archive-mixes";
export const COLLECTIONS_KEY = "the-colour-archive-collections";
export const RECIPES_KEY = "the-colour-archive-recipes";
export const PROJECTS_KEY = "the-colour-archive-projects";
export const PAINTS_KEY = "the-colour-archive-paints";
export const RECOVERY_KEY = "the-colour-archive-mixes-recovery";

/** Which storage key holds which list. */
const KEYS = {
  mixes: MIXES_KEY,
  collections: COLLECTIONS_KEY,
  recipes: RECIPES_KEY,
  projects: PROJECTS_KEY,
  paints: PAINTS_KEY,
} as const satisfies Record<keyof Archive, string>;

const FULL = "Your browser storage may be full.";

function readMixes(): { mixes: Mix[]; warning: string } {
  try {
    const stored = localStorage.getItem(MIXES_KEY);
    if (!stored) return { mixes: [], warning: "" };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved mixes are not in the expected format.");
    const mixes = parsed.filter(isStoredMix);
    if (mixes.length === parsed.length) return { mixes, warning: "" };

    // Keep the untouched original so the next save can't erase the damaged entries for good.
    const skipped = parsed.length - mixes.length;
    console.error(`Skipped ${skipped} damaged saved mix(es).`);
    try {
      if (localStorage.getItem(RECOVERY_KEY) === null) localStorage.setItem(RECOVERY_KEY, stored);
    } catch (recoveryError) {
      console.error("Could not keep a recovery copy of the saved mixes:", recoveryError);
    }
    return {
      mixes,
      warning: `${skipped} saved ${skipped === 1 ? "mix was" : "mixes were"} damaged and could not be shown. The rest of your archive is safe.`,
    };
  } catch (error) {
    console.error("Could not load saved colour mixes:", error);
    return { mixes: [], warning: "Your saved mixes could not be loaded. Check your browser storage settings and refresh." };
  }
}

/** Reads one of the simpler lists. Damaged entries are skipped. */
function readList<T>(key: string, isValid: (item: unknown) => item is T, label: string): { items: T[]; warning: string } {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return { items: [], warning: "" };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error(`Saved ${label} are not in the expected format.`);
    return { items: parsed.filter(isValid), warning: "" };
  } catch (error) {
    console.error(`Could not load saved ${label}:`, error);
    return { items: [], warning: `Your ${label} could not be loaded. Check your browser storage settings and refresh.` };
  }
}

const readCollections = () => readList(COLLECTIONS_KEY, isValidCollection, "collections");
const readRecipes = () => readList(RECIPES_KEY, isValidRecipe, "recipes");
const readProjects = () => readList(PROJECTS_KEY, isValidProject, "projects");
const readPaints = () => readList(PAINTS_KEY, isValidOwnedPaint, "paints");

/** Synchronous read, for the first render and for offering to move a browser archive into an account. */
export function readLocalArchive(): { archive: Archive; warning: string } {
  const mixes = readMixes();
  const lists = [readCollections(), readRecipes(), readProjects(), readPaints()] as const;
  const [collections, recipes, projects, paints] = lists;
  return {
    archive: { mixes: mixes.mixes, collections: collections.items, recipes: recipes.items, projects: projects.items, paints: paints.items },
    warning: mixes.warning || lists.map((list) => list.warning).find(Boolean) || "",
  };
}

export function clearLocalArchive(): void {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}

/**
 * Writes several lists as one change. If any write fails (storage full), every list is put back
 * the way it was, so the archive never ends up half-saved.
 */
function writeLists(lists: Partial<Archive>, failureMessage: string): void {
  const keys = (Object.keys(lists) as (keyof Archive)[]).map((name) => KEYS[name]);
  const previous = keys.map((key) => localStorage.getItem(key));
  try {
    (Object.entries(lists) as [keyof Archive, unknown][]).forEach(([name, value]) => localStorage.setItem(KEYS[name], JSON.stringify(value)));
  } catch (error) {
    try {
      keys.forEach((key, index) => {
        const value = previous[index];
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
    } catch (rollbackError) {
      console.error("Could not roll back a failed archive save:", rollbackError);
    }
    console.error("Could not save the archive:", error);
    throw new StoreError(failureMessage);
  }
}

const now = () => new Date().toISOString();

/** Adds or replaces one item in a list, by id. New items go first or last. */
function upsert<T extends { id: string }>(list: T[], item: T, newAt: "start" | "end" = "end"): T[] {
  if (list.some((entry) => entry.id === item.id)) return list.map((entry) => (entry.id === item.id ? item : entry));
  return newAt === "start" ? [item, ...list] : [...list, item];
}

export const localStore: ArchiveStore = {
  kind: "local",

  async load() {
    return readLocalArchive();
  },

  async saveMix(values, existing) {
    const { mixes } = readMixes();
    const saved: Mix = existing ? { ...existing, ...values } : { ...values, id: crypto.randomUUID(), createdAt: now() };
    writeLists({ mixes: upsert(mixes, saved, "start") }, `This mix could not be saved. ${FULL}`);
    return saved;
  },

  async setFavorite(mix, favorite) {
    const { mixes } = readMixes();
    const current = mixes.find((item) => item.id === mix.id) || mix;
    const saved: Mix = { ...current, favorite };
    writeLists({ mixes: upsert(mixes, saved, "start") }, `This mix could not be updated. ${FULL}`);
    return saved;
  },

  async deleteMixes(selected) {
    const ids = new Set(selected.map((mix) => mix.id));
    const { archive } = readLocalArchive();
    writeLists({
      mixes: archive.mixes.filter((item) => !ids.has(item.id)),
      collections: archive.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => !ids.has(id)) })),
    }, `These mixes could not be removed. ${FULL}`);
  },

  async deleteMix(mix) {
    const { archive } = readLocalArchive();
    writeLists({
      mixes: archive.mixes.filter((item) => item.id !== mix.id),
      collections: archive.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => id !== mix.id) })),
    }, `This mix could not be removed. ${FULL}`);
  },

  async saveCollection(values, existing) {
    const { items: collections } = readCollections();
    const saved = existing
      ? { ...existing, name: values.name, mixIds: values.mixIds }
      : { id: crypto.randomUUID(), name: values.name, mixIds: values.mixIds, createdAt: now() };
    writeLists({ collections: upsert(collections, saved) }, `This collection could not be saved. ${FULL}`);
    return saved;
  },

  async deleteCollection(id) {
    const { items: collections } = readCollections();
    writeLists({ collections: collections.filter((collection) => collection.id !== id) }, `This collection could not be deleted. ${FULL}`);
  },

  async saveRecipe(values, existing) {
    const { items: recipes } = readRecipes();
    const saved: Recipe = existing ? { ...existing, ...values } : { ...values, id: crypto.randomUUID(), createdAt: now() };
    writeLists({ recipes: upsert(recipes, saved, "start") }, `This recipe could not be saved. ${FULL}`);
    return saved;
  },

  async deleteRecipe(id) {
    const { items: recipes } = readRecipes();
    writeLists({ recipes: recipes.filter((recipe) => recipe.id !== id) }, `This recipe could not be deleted. ${FULL}`);
  },

  async saveProject(values, existing) {
    const { items: projects } = readProjects();
    const current = existing && projects.find((project) => project.id === existing.id);
    const saved: Project = current ? { ...current, ...values } : { ...values, id: crypto.randomUUID(), createdAt: now(), photos: [] };
    writeLists({ projects: upsert(projects, saved, "start") }, `This project could not be saved. ${FULL}`);
    return saved;
  },

  async deleteProject(project) {
    const { items: projects } = readProjects();
    writeLists({ projects: projects.filter((item) => item.id !== project.id) }, `This project could not be deleted. ${FULL}`);
  },

  async addProjectPhoto(project, image, caption) {
    const { items: projects } = readProjects();
    const current = projects.find((item) => item.id === project.id) || project;
    const saved: Project = { ...current, photos: [...current.photos, { id: crypto.randomUUID(), image, caption, addedAt: now() }] };
    writeLists({ projects: upsert(projects, saved) }, `This photo could not be saved. ${FULL}`);
    return saved;
  },

  async removeProjectPhoto(project, photoId) {
    const { items: projects } = readProjects();
    const current = projects.find((item) => item.id === project.id) || project;
    const saved: Project = { ...current, photos: current.photos.filter((photo) => photo.id !== photoId) };
    writeLists({ projects: upsert(projects, saved) }, `This photo could not be removed. ${FULL}`);
    return saved;
  },

  async savePaint(values, existing) {
    const { items: paints } = readPaints();
    const saved: OwnedPaint = existing ? { ...existing, ...values } : { ...values, id: crypto.randomUUID(), createdAt: now() };
    writeLists({ paints: upsert(paints, saved) }, `This paint could not be saved. ${FULL}`);
    return saved;
  },

  async deletePaint(id) {
    const { items: paints } = readPaints();
    writeLists({ paints: paints.filter((paint) => paint.id !== id) }, `This paint could not be removed. ${FULL}`);
  },

  async deletePaints(ids) {
    const remove = new Set(ids);
    const { items: paints } = readPaints();
    writeLists({ paints: paints.filter((paint) => !remove.has(paint.id)) }, `These paints could not be removed. ${FULL}`);
  },

  async importArchive(incoming, { mode, label, failureMessage }) {
    const message = failureMessage || `The backup could not be imported. ${FULL} Your archive was left unchanged.`;
    if (mode === "replace") {
      const mixIds = new Set(incoming.mixes.map((mix) => mix.id));
      const archive: Archive = {
        ...incoming,
        collections: incoming.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => mixIds.has(id)) })),
      };
      writeLists(archive, message);
      return {
        archive,
        addedMixes: archive.mixes.length,
        skippedMixes: 0,
        addedCollections: archive.collections.length,
        addedOther: { recipes: archive.recipes.length, projects: archive.projects.length, paints: archive.paints.length },
      };
    }

    const { archive: current } = readLocalArchive();
    const existingMixIds = new Set(current.mixes.map((mix) => mix.id));
    const newMixes = incoming.mixes.filter((mix) => !existingMixIds.has(mix.id));
    const mixes = [...newMixes, ...current.mixes];
    const mixIds = new Set(mixes.map((mix) => mix.id));
    const existingCollectionIds = new Set(current.collections.map((collection) => collection.id));
    const collections = [...current.collections];
    for (const collection of incoming.collections) {
      if (existingCollectionIds.has(collection.id)) continue;
      collections.push({
        ...collection,
        name: uniqueName(collection.name, label, collections.map((saved) => saved.name)),
        mixIds: collection.mixIds.filter((id) => mixIds.has(id)),
      });
    }

    const isNew = <T extends { id: string }>(list: T[]) => {
      const ids = new Set(list.map((item) => item.id));
      return (item: T) => !ids.has(item.id);
    };
    const newRecipes = incoming.recipes.filter(isNew(current.recipes));
    const newProjects = incoming.projects.filter(isNew(current.projects));
    // A paint already on the list under another id is the same paint, so it's skipped too.
    const knownPaints = new Set(current.paints.map((paint) => paintKey(paint.brand, paint.name)));
    const newPaints = incoming.paints.filter(isNew(current.paints)).filter((paint) => {
      const key = paintKey(paint.brand, paint.name);
      if (knownPaints.has(key)) return false;
      knownPaints.add(key);
      return true;
    });

    const archive: Archive = {
      mixes,
      collections,
      recipes: [...newRecipes, ...current.recipes],
      projects: [...newProjects, ...current.projects],
      paints: [...current.paints, ...newPaints],
    };
    writeLists(archive, message);
    return {
      archive,
      addedMixes: newMixes.length,
      skippedMixes: incoming.mixes.length - newMixes.length,
      addedCollections: collections.length - current.collections.length,
      addedOther: { recipes: newRecipes.length, projects: newProjects.length, paints: newPaints.length },
    };
  },

  async prepareExport(archive) {
    return archive;
  },
};

export const describeCounts = (mixes: number, collections: number) => `${plural(mixes, "mix", "mixes")} and ${plural(collections, "collection")}`;
