import type { MixInput, SharePayload, SharedLinkState, ShareLinkResult } from "../types";
import { requireSupabase, supabase } from "./supabase";
import { isValidSharePayload } from "./validation";

// Three kinds of share link, newest first:
//   /s/Ab3xK9q2   short link: a snapshot saved in Supabase (signed-in people)
//   /#s=<data>    compressed link: the recipe itself, deflated and base64url-encoded
//   /#share=<json> original link format, still accepted so old links keep working

export const SHORT_CODE_PATTERN = /^[A-Za-z0-9]{10}$/;
const MAX_UNPACKED_BYTES = 1_000_000;
const MAX_SHARED_PHOTOS = 12;
export const MAX_SHARE_URL_LENGTH = 16000;

// ---------- Compressed links ----------

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("The link contains characters that don't belong.");
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
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

export async function packPayload(payload: SharePayload): Promise<string> {
  const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toBase64Url(await readAll(stream, MAX_UNPACKED_BYTES));
}

export async function unpackPayload(text: string): Promise<unknown> {
  const stream = new Blob([fromBase64Url(text) as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(await readAll(stream, MAX_UNPACKED_BYTES)));
}

export const homeUrl = () => `${window.location.origin}/`;
export const compressedLink = (packed: string) => `${window.location.origin}/#s=${packed}`;
export const shortLink = (code: string) => `${window.location.origin}/s/${code}`;

// ---------- Reading a share from the address ----------

export type ShareAddress =
  | { type: "short"; code: string }
  | { type: "packed"; data: string }
  | { type: "legacy"; token: string };

/** What a pathname + hash holds: nothing, or the kind of share to open. */
export function readShareAddress(pathname: string, hash: string): ShareAddress | null {
  const short = pathname.match(/^\/s\/([A-Za-z0-9]{10})\/?$/);
  if (short) return { type: "short", code: short[1] };
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const packed = params.get("s");
  if (packed) return { type: "packed", data: packed };
  const legacy = params.get("share");
  if (legacy) return { type: "legacy", token: legacy };
  return null;
}

const INVALID: SharedLinkState = { status: "error", message: "This shared link is invalid or could not be opened." };

function decodeLegacy(token: string): SharedLinkState {
  try {
    const payload: unknown = JSON.parse(token);
    return isValidSharePayload(payload) ? { status: "ready", payload } : INVALID;
  } catch (error) {
    console.error("Could not read the shared colour link:", error);
    return INVALID;
  }
}

/** Synchronous first answer: old links decode at once, newer ones start loading. */
export function initialShareState(address: ShareAddress | null): SharedLinkState {
  if (!address) return null;
  return address.type === "legacy" ? decodeLegacy(address.token) : { status: "loading" };
}

export async function resolveShare(address: ShareAddress | null): Promise<SharedLinkState> {
  if (!address) return null;
  if (address.type === "legacy") return decodeLegacy(address.token);
  try {
    if (address.type === "packed") {
      const payload = await unpackPayload(address.data);
      return isValidSharePayload(payload) ? { status: "ready", payload } : INVALID;
    }
    if (!supabase) return { status: "error", message: "Short links can't be opened on this copy of the app." };
    const { data, error } = await supabase.rpc("get_share", { share_id: address.code });
    if (error) throw error;
    if (!data) return { status: "error", message: "This shared link doesn't exist, or its owner removed it." };
    return isValidSharePayload(data, { allowSharePhotos: true }) ? { status: "ready", payload: data } : INVALID;
  } catch (error) {
    console.error("Could not open the shared link:", error);
    return /fetch|network/i.test((error as Error)?.message || "")
      ? { status: "error", message: "This shared link couldn't be loaded. Check your internet connection and try again." }
      : INVALID;
  }
}

// ---------- Creating links ----------

export const sharedMixes = (payload: SharePayload): MixInput[] => (payload.kind === "mix" ? [payload.mix] : payload.mixes);

function mapMixes(payload: SharePayload, transform: (mix: MixInput, index: number) => MixInput): SharePayload {
  return payload.kind === "mix"
    ? { ...payload, mix: transform(payload.mix, 0) }
    : { ...payload, mixes: payload.mixes.map(transform) };
}

/** A compressed link. Only embedded photos fit, and only while the link stays a sensible length. */
export async function createCompressedLink(payload: SharePayload): Promise<ShareLinkResult> {
  const photoCount = sharedMixes(payload).filter((mix) => mix.image).length;
  const build = async (keepPhotos: boolean) => {
    const linkPayload = mapMixes(payload, (mix) => ({ ...mix, image: keepPhotos && mix.image.startsWith("data:") ? mix.image : "" }));
    return { url: compressedLink(await packPayload(linkPayload)), included: sharedMixes(linkPayload).filter((mix) => mix.image).length };
  };
  let link = await build(true);
  if (link.url.length > MAX_SHARE_URL_LENGTH) link = await build(false);
  if (link.url.length > MAX_SHARE_URL_LENGTH) {
    throw new Error("This collection is too large for one link. Share fewer mixes, or sign in to get a short link.");
  }
  return { url: link.url, short: false, photosIncluded: link.included, photosOmitted: photoCount - link.included };
}

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 10 characters from 62, with rejection sampling so every character is equally likely. */
export function newShareCode(): string {
  const code: string[] = [];
  while (code.length < 10) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && code.length < 10) code.push(CODE_ALPHABET[byte % 62]);
    }
  }
  return code.join("");
}

/**
 * A short link backed by a snapshot in Supabase. Photos (links or data URLs) are copied into the
 * public share-photos bucket so recipients can see them.
 */
export async function createShortLink(payload: SharePayload): Promise<ShareLinkResult> {
  const client = requireSupabase();
  const mixes = sharedMixes(payload);
  const bare = mapMixes(payload, (mix) => ({ ...mix, image: "" }));

  let code: string | null = null;
  for (let attempt = 0; attempt < 4 && !code; attempt += 1) {
    const candidate = newShareCode();
    const { error } = await client.from("shares").insert({ id: candidate, payload: bare });
    if (!error) code = candidate;
    else if (error.code !== "23505") throw error;
  }
  if (!code) throw new Error("A share code could not be reserved.");

  const photoIndexes = mixes.flatMap((mix, index) => (mix.image ? [index] : []));
  const links = new Map<number, string>();
  await Promise.all(photoIndexes.slice(0, MAX_SHARED_PHOTOS).map(async (index) => {
    try {
      const blob = await (await fetch(mixes[index].image)).blob();
      const extension = ({ "image/png": "png", "image/webp": "webp" } as Record<string, string>)[blob.type] || "jpg";
      const path = `${code}/${index}.${extension}`;
      const { error } = await client.storage.from("share-photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (error) throw error;
      links.set(index, client.storage.from("share-photos").getPublicUrl(path).data.publicUrl);
    } catch (error) {
      console.error("A photo could not be added to the share:", error);
    }
  }));

  if (links.size) {
    const finished = mapMixes(bare, (mix, index) => ({ ...mix, image: links.get(index) || "" }));
    const { error } = await client.from("shares").update({ payload: finished }).eq("id", code);
    if (error) throw error;
  }
  return { url: shortLink(code), short: true, photosIncluded: links.size, photosOmitted: photoIndexes.length - links.size };
}
