import type { Archive } from "../types";
import { isStoredMix, isValidCollection, isValidOwnedPaint, isValidProject, isValidRecipe, plural } from "./validation";

export const BACKUP_APP_ID = "the-colour-archive";
/** Version 2 added recipes, projects and paints. Version 1 backups (mixes and collections) still import. */
export const BACKUP_VERSION = 2;
const READABLE_VERSIONS = [1, 2];
export const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024;

/** Checks an optional list: missing is fine, anything damaged rejects the whole backup. */
function readList<T>(value: unknown, isValid: (item: unknown) => item is T, label: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isValid)) {
    throw new Error(`This backup has damaged ${label} data, so nothing was imported.`);
  }
  return value;
}

/** Reads a backup file's text. Throws an Error whose message can be shown as is. */
export function parseBackup(text: string): Archive {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn’t a Colour Archive backup. It could not be read as JSON.");
  }
  const backup = data as Record<string, unknown> | null;
  if (backup?.app !== BACKUP_APP_ID || !Array.isArray(backup.mixes) || !Array.isArray(backup.collections)) {
    throw new Error("This file isn’t a Colour Archive backup.");
  }
  if (!READABLE_VERSIONS.includes(backup.version as number)) {
    throw new Error("This backup was made by a different version of The Colour Archive and can’t be imported.");
  }
  const badMixes = backup.mixes.filter((mix) => !isStoredMix(mix)).length;
  if (badMixes) {
    throw new Error(`This backup has ${plural(badMixes, "damaged mix", "damaged mixes")}, so nothing was imported.`);
  }
  const collections = readList(backup.collections, isValidCollection, "collection");
  const mixes = backup.mixes.filter(isStoredMix);
  if (new Set(mixes.map((mix) => mix.id)).size !== mixes.length) {
    throw new Error("This backup lists the same mix more than once, so nothing was imported.");
  }
  return {
    mixes,
    collections,
    recipes: readList(backup.recipes, isValidRecipe, "recipe"),
    projects: readList(backup.projects, isValidProject, "project"),
    paints: readList(backup.paints, isValidOwnedPaint, "paint"),
  };
}

/** Builds the backup file. Photos must already be embedded as data URLs. */
export function createBackupFile(archive: Archive, now = new Date()): { blob: Blob; filename: string } {
  const backup = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    mixes: archive.mixes.map(({ imagePath: _imagePath, ...mix }) => mix),
    collections: archive.collections,
    recipes: archive.recipes,
    projects: archive.projects.map((project) => ({ ...project, photos: project.photos.map(({ path: _path, ...photo }) => photo) })),
    paints: archive.paints,
  };
  const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
  return {
    blob: new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    filename: `colour-archive-${stamp}.json`,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
