import { supabase } from "./supabase.js";

// Cloud storage for signed-in people. Every function returns data in the same shape the app
// uses for browser storage: mixes { id, name, color, notes, paints, image, createdAt } and
// collections { id, name, mixIds, createdAt }. Cloud mixes also carry imagePath, the photo's
// location in storage; their `image` is a temporary signed link to that photo.

const BUCKET = "mix-photos";
const PHOTO_LINK_SECONDS = 60 * 60 * 24; // photo links are refreshed every time the archive loads
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class CloudError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "CloudError";
    this.cause = cause;
  }
}

function check({ data, error }, what) {
  if (error) throw new CloudError(what, error);
  return data;
}

export function friendlyCloudError(error, fallback) {
  const cause = error?.cause || error;
  if (cause?.code === "23505") return "A collection with that name already exists.";
  if (cause instanceof TypeError || /fetch|network/i.test(cause?.message || "")) {
    return "Your account couldn't be reached. Check your internet connection and try again.";
  }
  if (cause?.status === 401 || cause?.code === "PGRST301") return "Your sign-in has expired. Sign in again to keep saving.";
  return fallback;
}

// ---------- Rows <-> app shapes ----------

function toMix(row, links) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    notes: row.notes,
    paints: Array.isArray(row.paints) ? row.paints : [],
    image: (row.image_path && links[row.image_path]) || "",
    imagePath: row.image_path || null,
    createdAt: row.created_at,
  };
}

function toRow(mix) {
  return {
    name: mix.name,
    color: mix.color,
    notes: mix.notes || "",
    paints: mix.paints.map(({ name, brand, drops, swatch }) => ({ name, brand, drops: String(drops), swatch })),
  };
}

// ---------- Photos ----------

async function photoLinks(paths) {
  if (!paths.length) return {};
  const data = check(await supabase.storage.from(BUCKET).createSignedUrls(paths, PHOTO_LINK_SECONDS), "Photo links could not be created.");
  return Object.fromEntries(data.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
}

async function uploadPhoto(userId, mixId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const extension = { "image/png": "png", "image/webp": "webp" }[blob.type] || "jpg";
  // A new file name for every upload, so a replaced photo never shows a cached copy.
  const path = `${userId}/${mixId}-${Date.now().toString(36)}.${extension}`;
  check(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false }), "The photo could not be uploaded.");
  return path;
}

async function removePhotos(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  // A leftover photo file is harmless, so a failed clean-up is only logged.
  if (error) console.error("Could not remove old photos:", error);
}

// Turns a photo link back into an embedded image, for backup files.
export async function photoAsDataUrl(link) {
  const blob = await (await fetch(link)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---------- Loading ----------

export async function loadArchive() {
  const [mixRows, collectionRows, linkRows] = await Promise.all([
    supabase.from("mixes").select("*").order("created_at", { ascending: false }).then((result) => check(result, "Your mixes could not be loaded.")),
    supabase.from("collections").select("*").order("created_at").then((result) => check(result, "Your collections could not be loaded.")),
    supabase.from("collection_mixes").select("collection_id, mix_id, added_at").order("added_at").then((result) => check(result, "Your collections could not be loaded.")),
  ]);
  const links = await photoLinks(mixRows.map((row) => row.image_path).filter(Boolean));
  const mixIdsByCollection = new Map();
  for (const link of linkRows) {
    if (!mixIdsByCollection.has(link.collection_id)) mixIdsByCollection.set(link.collection_id, []);
    mixIdsByCollection.get(link.collection_id).push(link.mix_id);
  }
  return {
    mixes: mixRows.map((row) => toMix(row, links)),
    collections: collectionRows.map((row) => ({
      id: row.id,
      name: row.name,
      mixIds: mixIdsByCollection.get(row.id) || [],
      createdAt: row.created_at,
    })),
  };
}

// ---------- Mixes ----------

// values come from the mix form. `existing` is the mix being edited, or null for a new one.
export async function saveMix(userId, values, existing) {
  const id = existing?.id || crypto.randomUUID();
  let imagePath = existing?.imagePath || null;
  let uploadedPath = null;
  let replacedPath = null;

  if (values.image.startsWith("data:")) {
    uploadedPath = await uploadPhoto(userId, id, values.image);
    replacedPath = imagePath;
    imagePath = uploadedPath;
  } else if (!values.image && imagePath) {
    replacedPath = imagePath;
    imagePath = null;
  }

  const row = { ...toRow(values), image_path: imagePath };
  const query = existing
    ? supabase.from("mixes").update(row).eq("id", id)
    : supabase.from("mixes").insert({ ...row, id });
  const result = await query.select().single();
  if (result.error) {
    await removePhotos([uploadedPath]);
    throw new CloudError("The mix could not be saved.", result.error);
  }
  await removePhotos([replacedPath]);
  const links = uploadedPath ? await photoLinks([uploadedPath]) : { [imagePath]: existing?.image };
  return toMix(result.data, links);
}

export async function deleteMix(mix) {
  check(await supabase.from("mixes").delete().eq("id", mix.id), "The mix could not be deleted.");
  await removePhotos([mix.imagePath]);
}

// ---------- Collections ----------

// values: { id?, name, mixIds }. `existing` is the collection being edited, or null for a new one.
export async function saveCollection(values, existing) {
  let collection;
  if (existing) {
    collection = check(await supabase.from("collections").update({ name: values.name }).eq("id", existing.id).select().single(), "The collection could not be saved.");
    const removed = existing.mixIds.filter((id) => !values.mixIds.includes(id));
    const added = values.mixIds.filter((id) => !existing.mixIds.includes(id));
    if (removed.length) {
      check(await supabase.from("collection_mixes").delete().eq("collection_id", existing.id).in("mix_id", removed), "The collection could not be saved.");
    }
    if (added.length) {
      check(await supabase.from("collection_mixes").insert(added.map((mixId) => ({ collection_id: existing.id, mix_id: mixId }))), "The collection could not be saved.");
    }
  } else {
    collection = check(await supabase.from("collections").insert({ name: values.name }).select().single(), "The collection could not be created.");
    if (values.mixIds.length) {
      const links = await supabase.from("collection_mixes").insert(values.mixIds.map((mixId) => ({ collection_id: collection.id, mix_id: mixId })));
      if (links.error) {
        await supabase.from("collections").delete().eq("id", collection.id);
        throw new CloudError("The collection could not be created.", links.error);
      }
    }
  }
  return { id: collection.id, name: collection.name, mixIds: [...values.mixIds], createdAt: collection.created_at };
}

export async function deleteCollection(id) {
  check(await supabase.from("collections").delete().eq("id", id), "The collection could not be deleted.");
}

// ---------- Bulk: imports, shared links and moving a browser archive into an account ----------

// The same source id always maps to the same cloud id for one person, so importing a backup
// twice skips the mixes it already added, and two people importing one file never collide.
async function cloudIdFor(userId, sourceId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${sourceId}`));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function clearArchive(userId) {
  // Removing mixes and collections also removes every link between them.
  check(await supabase.from("collections").delete().eq("user_id", userId), "Your archive could not be replaced.");
  check(await supabase.from("mixes").delete().eq("user_id", userId), "Your archive could not be replaced.");
  const files = check(await supabase.storage.from(BUCKET).list(userId, { limit: 1000 }), "Your archive could not be replaced.");
  await removePhotos(files.map((file) => `${userId}/${file.name}`));
}

async function inBatches(items, size, task) {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(task));
  }
}

function uniqueName(baseName, label, takenNames) {
  if (!takenNames.has(baseName.toLowerCase())) return baseName;
  let name = `${baseName} (${label})`;
  for (let suffix = 2; takenNames.has(name.toLowerCase()); suffix += 1) name = `${baseName} (${label} ${suffix})`;
  return name;
}

// archive: { mixes, collections } in the app's shapes (photos as data URLs or "").
// mode "merge" adds what is missing; "replace" empties the account first.
export async function importArchive(userId, archive, { mode = "merge", label = "imported" } = {}) {
  if (mode === "replace") await clearArchive(userId);

  const existingMixIds = new Set();
  const existingCollections = [];
  if (mode !== "replace") {
    const [mixRows, collectionRows] = await Promise.all([
      supabase.from("mixes").select("id").then((result) => check(result, "Your archive could not be checked.")),
      supabase.from("collections").select("id, name").then((result) => check(result, "Your archive could not be checked.")),
    ]);
    mixRows.forEach((row) => existingMixIds.add(row.id));
    existingCollections.push(...collectionRows);
  }

  // Work out each incoming mix's cloud id, skipping mixes this account already has.
  const idMap = new Map();
  const newMixes = [];
  for (const mix of archive.mixes) {
    const ownId = UUID.test(mix.id) && existingMixIds.has(mix.id) ? mix.id : await cloudIdFor(userId, mix.id);
    idMap.set(mix.id, ownId);
    if (existingMixIds.has(ownId)) continue;
    existingMixIds.add(ownId);
    newMixes.push({ mix, id: ownId });
  }

  const uploaded = [];
  try {
    const rows = [];
    await inBatches(newMixes, 4, async ({ mix, id }) => {
      const imagePath = mix.image?.startsWith("data:") ? await uploadPhoto(userId, id, mix.image) : null;
      if (imagePath) uploaded.push(imagePath);
      rows.push({ ...toRow(mix), id, image_path: imagePath, created_at: mix.createdAt || new Date().toISOString() });
    });
    for (let start = 0; start < rows.length; start += 200) {
      check(await supabase.from("mixes").insert(rows.slice(start, start + 200)), "The mixes could not be imported.");
    }
  } catch (error) {
    await removePhotos(uploaded);
    throw error;
  }

  const existingCollectionIds = new Set(existingCollections.map((collection) => collection.id));
  const takenNames = new Set(existingCollections.map((collection) => collection.name.toLowerCase()));
  let addedCollections = 0;
  for (const collection of archive.collections) {
    let id = UUID.test(collection.id) && existingCollectionIds.has(collection.id) ? collection.id : await cloudIdFor(userId, `collection:${collection.id}`);
    if (!existingCollectionIds.has(id)) {
      const name = uniqueName(collection.name, label, takenNames);
      check(await supabase.from("collections").insert({ id, name, created_at: collection.createdAt || new Date().toISOString() }), "A collection could not be imported.");
      existingCollectionIds.add(id);
      takenNames.add(name.toLowerCase());
      addedCollections += 1;
    }
    const links = collection.mixIds.map((mixId) => idMap.get(mixId)).filter(Boolean).map((mixId) => ({ collection_id: id, mix_id: mixId }));
    if (links.length) {
      check(await supabase.from("collection_mixes").upsert(links, { onConflict: "collection_id,mix_id", ignoreDuplicates: true }), "A collection could not be imported.");
    }
  }

  return {
    archive: await loadArchive(),
    addedMixes: newMixes.length,
    skippedMixes: archive.mixes.length - newMixes.length,
    addedCollections,
  };
}
