import type { Archive, Collection, Mix } from "../../types";
import { StoreError } from "../errors";
import { isStoredMix, isValidCollection, plural, uniqueName } from "../validation";
import type { ArchiveStore } from "./types";

export const MIXES_KEY = "the-colour-archive-mixes";
export const COLLECTIONS_KEY = "the-colour-archive-collections";
export const RECOVERY_KEY = "the-colour-archive-mixes-recovery";

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

function readCollections(): { collections: Collection[]; warning: string } {
  try {
    const stored = localStorage.getItem(COLLECTIONS_KEY);
    if (!stored) return { collections: [], warning: "" };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved collections are not in the expected format.");
    return { collections: parsed.filter(isValidCollection), warning: "" };
  } catch (error) {
    console.error("Could not load saved collections:", error);
    return { collections: [], warning: "Your collections could not be loaded. Check your browser storage settings and refresh." };
  }
}

/** Synchronous read, for the first render and for offering to move a browser archive into an account. */
export function readLocalArchive(): { archive: Archive; warning: string } {
  const mixes = readMixes();
  const collections = readCollections();
  return { archive: { mixes: mixes.mixes, collections: collections.collections }, warning: mixes.warning || collections.warning };
}

export function clearLocalArchive(): void {
  localStorage.removeItem(MIXES_KEY);
  localStorage.removeItem(COLLECTIONS_KEY);
}

function write(key: string, value: unknown, failureMessage: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Could not write to browser storage:", error);
    throw new StoreError(failureMessage);
  }
}

/** Saves mixes and collections together. If either write fails, both are rolled back. */
function writeArchive(archive: Archive, failureMessage: string): void {
  const previousMixes = localStorage.getItem(MIXES_KEY);
  const previousCollections = localStorage.getItem(COLLECTIONS_KEY);
  try {
    localStorage.setItem(MIXES_KEY, JSON.stringify(archive.mixes));
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(archive.collections));
  } catch (error) {
    try {
      if (previousMixes === null) localStorage.removeItem(MIXES_KEY);
      else localStorage.setItem(MIXES_KEY, previousMixes);
      if (previousCollections === null) localStorage.removeItem(COLLECTIONS_KEY);
      else localStorage.setItem(COLLECTIONS_KEY, previousCollections);
    } catch (rollbackError) {
      console.error("Could not roll back a failed archive save:", rollbackError);
    }
    console.error("Could not save the archive:", error);
    throw new StoreError(failureMessage);
  }
}

const now = () => new Date().toISOString();

export const localStore: ArchiveStore = {
  kind: "local",

  async load() {
    return readLocalArchive();
  },

  async saveMix(values, existing) {
    const { mixes } = readMixes();
    const saved: Mix = existing ? { ...existing, ...values } : { ...values, id: crypto.randomUUID(), createdAt: now() };
    const next = existing ? mixes.map((mix) => (mix.id === existing.id ? saved : mix)) : [saved, ...mixes];
    write(MIXES_KEY, next, `This mix could not be saved. ${FULL}`);
    return saved;
  },

  async deleteMix(mix) {
    const { archive } = readLocalArchive();
    writeArchive({
      mixes: archive.mixes.filter((item) => item.id !== mix.id),
      collections: archive.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => id !== mix.id) })),
    }, `This mix could not be removed. ${FULL}`);
  },

  async saveCollection(values, existing) {
    const { collections } = readCollections();
    const saved: Collection = existing
      ? { ...existing, name: values.name, mixIds: values.mixIds }
      : { id: crypto.randomUUID(), name: values.name, mixIds: values.mixIds, createdAt: now() };
    const next = existing ? collections.map((collection) => (collection.id === existing.id ? saved : collection)) : [...collections, saved];
    write(COLLECTIONS_KEY, next, `This collection could not be saved. ${FULL}`);
    return saved;
  },

  async deleteCollection(id) {
    const { collections } = readCollections();
    write(COLLECTIONS_KEY, collections.filter((collection) => collection.id !== id), `This collection could not be deleted. ${FULL}`);
  },

  async importArchive(incoming, { mode, label, failureMessage }) {
    const message = failureMessage || `The backup could not be imported. ${FULL} Your archive was left unchanged.`;
    if (mode === "replace") {
      const mixIds = new Set(incoming.mixes.map((mix) => mix.id));
      const archive = {
        mixes: incoming.mixes,
        collections: incoming.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => mixIds.has(id)) })),
      };
      writeArchive(archive, message);
      return { archive, addedMixes: archive.mixes.length, skippedMixes: 0, addedCollections: archive.collections.length };
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
    const archive = { mixes, collections };
    writeArchive(archive, message);
    return {
      archive,
      addedMixes: newMixes.length,
      skippedMixes: incoming.mixes.length - newMixes.length,
      addedCollections: collections.length - current.collections.length,
    };
  },

  async prepareExport(archive) {
    return archive;
  },
};

export const describeCounts = (mixes: number, collections: number) => `${plural(mixes, "mix", "mixes")} and ${plural(collections, "collection")}`;
