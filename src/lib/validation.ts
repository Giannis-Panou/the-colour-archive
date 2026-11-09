import type { Collection, Mix, MixInput, SharePayload } from "../types";

export const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const HEX_COLOR = /^#[\da-f]{6}$/i;
const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[\da-z+/=]+$/i;

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || "";
const SHARE_PHOTO_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/share-photos/` : null;
const SHARE_PHOTO_PATH = /^[A-Za-z0-9]{10}\/\d{1,3}\.(?:jpg|png|webp)$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A photo copy inside the public share-photos bucket, as used by short links. */
export function isSharePhotoUrl(value: unknown): value is string {
  return Boolean(SHARE_PHOTO_PREFIX && typeof value === "string" && value.startsWith(SHARE_PHOTO_PREFIX)
    && SHARE_PHOTO_PATH.test(value.slice(SHARE_PHOTO_PREFIX.length)));
}

export function isDataImage(value: string): boolean {
  return DATA_IMAGE.test(value);
}

/**
 * The recipe fields every mix needs, whether it comes from storage, a share link or a backup.
 * Shared snapshots may also point at a photo copy in the public share-photos bucket.
 */
export function isValidMix(mix: unknown, { allowSharePhotos = false } = {}): mix is MixInput {
  if (!isRecord(mix)) return false;
  const { name, color, notes, paints, image } = mix;
  return typeof name === "string"
    && typeof color === "string" && HEX_COLOR.test(color)
    && typeof notes === "string"
    && Array.isArray(paints)
    && paints.every((paint) => isRecord(paint)
      && typeof paint.name === "string"
      && typeof paint.brand === "string"
      && typeof paint.drops === "string"
      && typeof paint.swatch === "string")
    && (image === "" || (typeof image === "string" && isDataImage(image)) || (allowSharePhotos && isSharePhotoUrl(image)));
}

/** A mix saved in an archive also carries its identity and creation date. */
export function isStoredMix(mix: unknown): mix is Mix {
  return isValidMix(mix)
    && isRecord(mix)
    && typeof mix.id === "string" && mix.id !== ""
    && typeof mix.createdAt === "string" && !Number.isNaN(new Date(mix.createdAt).getTime());
}

export function isValidCollection(collection: unknown): collection is Collection {
  return isRecord(collection)
    && typeof collection.id === "string"
    && typeof collection.name === "string"
    && Array.isArray(collection.mixIds)
    && collection.mixIds.every((id) => typeof id === "string");
}

export function isValidSharePayload(payload: unknown, options?: { allowSharePhotos?: boolean }): payload is SharePayload {
  if (!isRecord(payload) || payload.version !== 1) return false;
  if (payload.kind === "mix") return isValidMix(payload.mix, options);
  if (payload.kind === "collection") {
    return typeof payload.name === "string" && Array.isArray(payload.mixes) && payload.mixes.every((mix) => isValidMix(mix, options));
  }
  return false;
}

/**
 * "Cloaks" → "Cloaks (shared)" → "Cloaks (shared 2)" … until the name is free.
 * Returns the name unchanged when nothing else uses it.
 */
export function uniqueName(baseName: string, label: string, takenNames: Iterable<string>): string {
  const taken = new Set([...takenNames].map((name) => name.toLowerCase()));
  if (!taken.has(baseName.toLowerCase())) return baseName;
  let name = `${baseName} (${label})`;
  for (let suffix = 2; taken.has(name.toLowerCase()); suffix += 1) name = `${baseName} (${label} ${suffix})`;
  return name;
}

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
