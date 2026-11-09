import type { Archive } from "../types";
import { isStoredMix, isValidCollection, plural } from "./validation";

export const BACKUP_APP_ID = "the-colour-archive";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024;

/** Reads a backup file's text. Throws an Error whose message can be shown as is. */
export function parseBackup(text: string): Archive {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn’t a Colour Archive backup. It could not be read as JSON.");
  }
  const backup = data as { app?: unknown; version?: unknown; mixes?: unknown; collections?: unknown } | null;
  if (backup?.app !== BACKUP_APP_ID || !Array.isArray(backup.mixes) || !Array.isArray(backup.collections)) {
    throw new Error("This file isn’t a Colour Archive backup.");
  }
  if (backup.version !== BACKUP_VERSION) {
    throw new Error("This backup was made by a different version of The Colour Archive and can’t be imported.");
  }
  const badMixes = backup.mixes.filter((mix) => !isStoredMix(mix)).length;
  if (badMixes) {
    throw new Error(`This backup has ${plural(badMixes, "damaged mix", "damaged mixes")}, so nothing was imported.`);
  }
  if (!backup.collections.every(isValidCollection)) {
    throw new Error("This backup has damaged collection data, so nothing was imported.");
  }
  const mixes = backup.mixes.filter(isStoredMix);
  if (new Set(mixes.map((mix) => mix.id)).size !== mixes.length) {
    throw new Error("This backup lists the same mix more than once, so nothing was imported.");
  }
  return { mixes, collections: backup.collections.filter(isValidCollection) };
}

/** Builds the backup file. Photos must already be embedded as data URLs. */
export function createBackupFile(archive: Archive, now = new Date()): { blob: Blob; filename: string } {
  const backup = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    mixes: archive.mixes.map(({ imagePath: _imagePath, ...mix }) => mix),
    collections: archive.collections,
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
