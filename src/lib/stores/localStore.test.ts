import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MixInput } from "../../types";
import { COLLECTIONS_KEY, localStore, MIXES_KEY, readLocalArchive, RECOVERY_KEY } from "./localStore";

const recipe: MixInput = { name: "Mossy stone", color: "#5d6b3c", notes: "", image: "", paints: [{ name: "Greenskin", brand: "The Army Painter", drops: "3", swatch: "#2c6e3a" }] };
const stored = () => ({ mixes: JSON.parse(localStorage.getItem(MIXES_KEY) || "[]"), collections: JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "[]") });

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("localStore", () => {
  it("creates, edits and deletes a mix, removing it from collections", async () => {
    const created = await localStore.saveMix(recipe, null);
    expect(created.id).toBeTruthy();
    const edited = await localStore.saveMix({ ...recipe, name: "Mossy stone v2" }, created);
    expect(edited).toMatchObject({ id: created.id, createdAt: created.createdAt, name: "Mossy stone v2" });

    const collection = await localStore.saveCollection({ name: "Bases", mixIds: [created.id] }, null);
    await localStore.deleteMix(edited);
    expect(stored().mixes).toHaveLength(0);
    expect(stored().collections[0]).toMatchObject({ id: collection.id, mixIds: [] });
  });

  it("merges a backup, skipping known mixes and renaming clashing collections", async () => {
    const mine = await localStore.saveMix(recipe, null);
    await localStore.saveCollection({ name: "Bases", mixIds: [] }, null);
    const incoming = {
      mixes: [mine, { ...recipe, id: "new", createdAt: "2026-11-01T10:00:00.000Z" }],
      collections: [{ id: "other", name: "bases", mixIds: ["new", "missing"] }],
    };
    const result = await localStore.importArchive(incoming, { mode: "merge", label: "imported" });
    expect(result).toMatchObject({ addedMixes: 1, skippedMixes: 1, addedCollections: 1 });
    expect(result.archive.collections.map((collection) => collection.name)).toEqual(["Bases", "bases (imported)"]);
    expect(result.archive.collections[1].mixIds).toEqual(["new"]);
  });

  it("replaces the archive with a backup", async () => {
    await localStore.saveMix(recipe, null);
    const result = await localStore.importArchive({ mixes: [], collections: [{ id: "c", name: "Empty", mixIds: ["gone"] }] }, { mode: "replace", label: "imported" });
    expect(result.archive.mixes).toHaveLength(0);
    expect(stored().collections[0].mixIds).toEqual([]);
  });

  it("keeps damaged entries in a recovery copy and reports them", () => {
    localStorage.setItem(MIXES_KEY, JSON.stringify([{ ...recipe, id: "ok", createdAt: "2026-11-01T10:00:00Z" }, { name: 5 }]));
    const { archive, warning } = readLocalArchive();
    expect(archive.mixes).toHaveLength(1);
    expect(warning).toContain("1 saved mix was damaged");
    expect(localStorage.getItem(RECOVERY_KEY)).toContain('"name":5');
  });

  it("rolls both lists back when storage is full", async () => {
    const mix = await localStore.saveMix(recipe, null);
    await localStore.saveCollection({ name: "Bases", mixIds: [mix.id] }, null);
    const before = stored();
    const realSetItem = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      // Let the mixes write through, then fail on collections, as a nearly full storage would.
      calls += 1;
      if (calls === 2) throw new DOMException("Quota exceeded", "QuotaExceededError");
      realSetItem.call(this, key, value);
    });
    await expect(localStore.deleteMix(mix)).rejects.toThrow("browser storage may be full");
    vi.restoreAllMocks();
    expect(stored()).toEqual(before);
  });
});
