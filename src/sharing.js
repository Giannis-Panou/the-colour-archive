import { supabase } from "./supabase.js";

// Three kinds of share link, newest first:
//   /s/Ab3xK9q2   short link: a snapshot saved in Supabase (signed-in people)
//   #s=<data>     compressed link: the recipe itself, deflated and base64url-encoded
//   #share=<json> original link format, still accepted so old links keep working

export const SHORT_LINK_PATTERN = /^\/s\/([A-Za-z0-9]{10})\/?$/;
const MAX_UNPACKED_BYTES = 1_000_000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SHARE_PHOTO_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/share-photos/` : null;
const SHARE_PHOTO_PATH = /^[A-Za-z0-9]{10}\/\d{1,3}\.(?:jpg|png|webp)$/;

export function isSharePhotoUrl(value) {
  return Boolean(SHARE_PHOTO_PREFIX && typeof value === "string" && value.startsWith(SHARE_PHOTO_PREFIX)
    && SHARE_PHOTO_PATH.test(value.slice(SHARE_PHOTO_PREFIX.length)));
}

// The recipe fields every mix needs, whether it comes from storage, a share link or a backup.
// Shared snapshots may also point at a photo copy in the public share-photos bucket.
export function isValidMix(mix, { allowSharePhotos = false } = {}) {
  return Boolean(
    mix &&
    typeof mix.name === "string" &&
    typeof mix.color === "string" &&
    /^#[\da-f]{6}$/i.test(mix.color) &&
    typeof mix.notes === "string" &&
    Array.isArray(mix.paints) &&
    mix.paints.every((paint) =>
      paint &&
      typeof paint.name === "string" &&
      typeof paint.brand === "string" &&
      typeof paint.drops === "string" &&
      typeof paint.swatch === "string",
    ) &&
    (mix.image === ""
      || (typeof mix.image === "string" && /^data:image\/(?:jpeg|png|webp);base64,[\da-z+/=]+$/i.test(mix.image))
      || (allowSharePhotos && isSharePhotoUrl(mix.image))),
  );
}

export function validateSharePayload(payload, options) {
  if (payload?.version !== 1 || !["mix", "collection"].includes(payload.kind)) return false;
  if (payload.kind === "mix") return isValidMix(payload.mix, options);
  return typeof payload.name === "string" && Array.isArray(payload.mixes) && payload.mixes.every((mix) => isValidMix(mix, options));
}

// ---------- Compressed links ----------

function toBase64Url(bytes) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("The link contains characters that don't belong.");
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function readAll(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // Stop early instead of unpacking a deliberately oversized link.
    if (size > limit) {
      await reader.cancel();
      throw new Error("The shared recipe is too large to open.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export async function packPayload(payload) {
  const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toBase64Url(await readAll(stream, MAX_UNPACKED_BYTES));
}

export async function unpackPayload(text) {
  const stream = new Blob([fromBase64Url(text)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(await readAll(stream, MAX_UNPACKED_BYTES)));
}

export function compressedLink(packed) {
  return `${window.location.origin}/#s=${packed}`;
}

export function shortLink(code) {
  return `${window.location.origin}/s/${code}`;
}

export function homeUrl() {
  return `${window.location.origin}/`;
}

// ---------- Reading the current address ----------

function hashParams() {
  return new URLSearchParams(window.location.hash.slice(1));
}

// What the current address holds: null (no share), or the kind of share to resolve.
export function shareInAddress() {
  const shortMatch = window.location.pathname.match(SHORT_LINK_PATTERN);
  if (shortMatch) return { type: "short", code: shortMatch[1] };
  const params = hashParams();
  if (params.get("s")) return { type: "packed", data: params.get("s") };
  if (params.get("share")) return { type: "legacy", token: params.get("share") };
  return null;
}

const INVALID = { error: "This shared link is invalid or could not be opened." };

function decodeLegacy(token) {
  try {
    const payload = JSON.parse(token);
    return validateSharePayload(payload) ? payload : INVALID;
  } catch (error) {
    console.error("Could not read the shared colour link:", error);
    return INVALID;
  }
}

// Synchronous first answer for the first render: old links decode at once, others show "loading".
export function initialShareState() {
  const found = shareInAddress();
  if (!found) return null;
  if (found.type === "legacy") return decodeLegacy(found.token);
  return { loading: true };
}

export async function resolveShare() {
  const found = shareInAddress();
  if (!found) return null;
  if (found.type === "legacy") return decodeLegacy(found.token);
  try {
    if (found.type === "packed") {
      const payload = await unpackPayload(found.data);
      return validateSharePayload(payload) ? payload : INVALID;
    }
    if (!supabase) return { error: "Short links can't be opened on this copy of the app." };
    const { data, error } = await supabase.rpc("get_share", { share_id: found.code });
    if (error) throw error;
    if (!data) return { error: "This shared link doesn't exist, or its owner removed it." };
    return validateSharePayload(data, { allowSharePhotos: true }) ? data : INVALID;
  } catch (error) {
    console.error("Could not open the shared link:", error);
    return /fetch|network/i.test(error?.message || "")
      ? { error: "This shared link couldn't be loaded. Check your internet connection and try again." }
      : INVALID;
  }
}

// ---------- Short links (signed-in people) ----------

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function newShareCode() {
  // 62^10 possible codes; rejection sampling keeps every character equally likely.
  const code = [];
  while (code.length < 10) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && code.length < 10) code.push(CODE_ALPHABET[byte % 62]);
    }
  }
  return code.join("");
}

const MAX_SHARED_PHOTOS = 12;

// payload: { version, kind, mix | name + mixes } with photos as links or data URLs.
// Returns { url, photosIncluded, photosOmitted }.
export async function createShortLink(payload) {
  const mixes = payload.kind === "mix" ? [payload.mix] : payload.mixes;
  const withoutPhotos = (mix) => ({ ...mix, image: "" });
  const bare = payload.kind === "mix" ? { ...payload, mix: withoutPhotos(payload.mix) } : { ...payload, mixes: payload.mixes.map(withoutPhotos) };

  let code;
  for (let attempt = 0; attempt < 4 && !code; attempt += 1) {
    const candidate = newShareCode();
    const { error } = await supabase.from("shares").insert({ id: candidate, payload: bare });
    if (!error) code = candidate;
    else if (error.code !== "23505") throw error;
  }
  if (!code) throw new Error("A share code could not be reserved.");

  // Copy each photo into the public share folder, then store the finished snapshot.
  const photoIndexes = mixes.map((mix, index) => (mix.image ? index : -1)).filter((index) => index >= 0);
  const toCopy = photoIndexes.slice(0, MAX_SHARED_PHOTOS);
  const links = new Map();
  await Promise.all(toCopy.map(async (index) => {
    try {
      const blob = await (await fetch(mixes[index].image)).blob();
      const extension = { "image/png": "png", "image/webp": "webp" }[blob.type] || "jpg";
      const path = `${code}/${index}.${extension}`;
      const { error } = await supabase.storage.from("share-photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (error) throw error;
      links.set(index, supabase.storage.from("share-photos").getPublicUrl(path).data.publicUrl);
    } catch (error) {
      console.error("A photo could not be added to the share:", error);
    }
  }));

  if (links.size) {
    const finalMixes = mixes.map((mix, index) => ({ ...mix, image: links.get(index) || "" }));
    const finished = payload.kind === "mix" ? { ...bare, mix: finalMixes[0] } : { ...bare, mixes: finalMixes };
    const { error } = await supabase.from("shares").update({ payload: finished }).eq("id", code);
    if (error) throw error;
  }
  return { url: shortLink(code), photosIncluded: links.size, photosOmitted: photoIndexes.length - links.size };
}
