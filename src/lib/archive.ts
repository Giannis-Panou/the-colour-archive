import type { Archive } from "../types";

export const emptyArchive = (): Archive => ({ mixes: [], collections: [], recipes: [], projects: [], paints: [] });

/** Fills in the lists a partial archive leaves out, e.g. a shared collection that only has mixes. */
export const completeArchive = (archive: Partial<Archive>): Archive => ({ ...emptyArchive(), ...archive });

export const isArchiveEmpty = (archive: Archive) => !archive.mixes.length && !archive.collections.length
  && !archive.recipes.length && !archive.projects.length && !archive.paints.length;
