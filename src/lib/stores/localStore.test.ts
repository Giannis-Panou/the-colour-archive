import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MixInput } from "../../types";
import { completeArchive } from "../archive";
import { COLLECTIONS_KEY, localStore, MIXES_KEY, PAINTS_KEY, PROJECTS_KEY, readLocalArchive, RECIPES_KEY, RECOVERY_KEY } from "./localStore";

const recipe: MixInput = { name: "Mossy stone", color: "#5d6b3c", notes: "", image: "", paints: [{ name: "Greenskin", brand: "The Army Painter", drops: "3", swatch: "#2c6e3a" }] };
const read = (key: string) => JSON.parse(localStorage.getItem(key) || "[]");
const stored = () => ({ mixes: read(MIXES_KEY), collections: read(COLLECTIONS_KEY) });
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";
const date = "2026-11-01T10:00:00.000Z";

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

  it("deletes several mixes and paints at once, leaving the rest", async () => {
    const [a, b, c] = [await localStore.saveMix(recipe, null), await localStore.saveMix({ ...recipe, name: "B" }, null), await localStore.saveMix({ ...recipe, name: "C" }, null)];
    await localStore.saveCollection({ name: "Bases", mixIds: [a.id, b.id, c.id] }, null);
    await localStore.deleteMixes([a, c]);
    expect(stored().mixes.map((mix: { id: string }) => mix.id)).toEqual([b.id]);
    expect(stored().collections[0].mixIds).toEqual([b.id]);

    const paints = [];
    for (const name of ["One", "Two", "Three"]) paints.push(await localStore.savePaint({ name, brand: "Citadel", swatch: "#112233", status: "have" }, null));
    await localStore.deletePaints([paints[0].id, paints[2].id]);
    expect(read(PAINTS_KEY).map((paint: { name: string }) => paint.name)).toEqual(["Two"]);
  });

  it("stars a mix, and editing it keeps the star", async () => {
    const created = await localStore.saveMix(recipe, null);
    const starred = await localStore.setFavorite(created, true);
    expect(starred.favorite).toBe(true);
    await localStore.saveMix({ ...recipe, name: "Renamed" }, starred);
    expect(readLocalArchive().archive.mixes[0]).toMatchObject({ name: "Renamed", favorite: true });
  });

  it("saves, edits and deletes recipes and paints", async () => {
    const mix = await localStore.saveMix(recipe, null);
    const saved = await localStore.saveRecipe({ name: "Moss", notes: "", steps: [{ role: "Base", mixId: mix.id, paint: "", note: "" }] }, null);
    await localStore.saveRecipe({ ...saved, name: "Moss v2" }, saved);
    expect(read(RECIPES_KEY)).toEqual([expect.objectContaining({ id: saved.id, name: "Moss v2" })]);

    const paint = await localStore.savePaint({ name: "Greenskin", brand: "The Army Painter", swatch: "#2c6e3a", status: "have" }, null);
    await localStore.savePaint({ ...paint, status: "low" }, paint);
    expect(read(PAINTS_KEY)).toEqual([expect.objectContaining({ id: paint.id, status: "low" })]);

    await localStore.deleteRecipe(saved.id);
    await localStore.deletePaint(paint.id);
    expect(readLocalArchive().archive).toMatchObject({ recipes: [], paints: [] });
  });

  it("keeps a project's photos when its details change", async () => {
    const project = await localStore.saveProject({ name: "Skeletons", notes: "", recipeIds: [], mixIds: [] }, null);
    const withPhoto = await localStore.addProjectPhoto(project, PHOTO, "Primed");
    // The details form passes the project as it was opened, before the photo was added.
    await localStore.saveProject({ name: "Skeleton horde", notes: "", recipeIds: [], mixIds: [] }, project);
    const [saved] = read(PROJECTS_KEY);
    expect(saved).toMatchObject({ name: "Skeleton horde", photos: [{ caption: "Primed", image: PHOTO }] });
    const without = await localStore.removeProjectPhoto(withPhoto, withPhoto.photos[0].id);
    expect(without.photos).toEqual([]);
  });

  it("merges a backup, skipping known mixes and renaming clashing collections", async () => {
    const mine = await localStore.saveMix(recipe, null);
    await localStore.saveCollection({ name: "Bases", mixIds: [] }, null);
    const incoming = completeArchive({
      mixes: [mine, { ...recipe, id: "new", createdAt: date }],
      collections: [{ id: "other", name: "bases", mixIds: ["new", "missing"] }],
    });
    const result = await localStore.importArchive(incoming, { mode: "merge", label: "imported" });
    expect(result).toMatchObject({ addedMixes: 1, skippedMixes: 1, addedCollections: 1 });
    expect(result.archive.collections.map((collection) => collection.name)).toEqual(["Bases", "bases (imported)"]);
    expect(result.archive.collections[1].mixIds).toEqual(["new"]);
  });

  it("merges recipes, projects and paints, skipping paints already on the list", async () => {
    await localStore.savePaint({ name: "Greenskin", brand: "The Army Painter", swatch: "#2c6e3a", status: "have" }, null);
    const incoming = completeArchive({
      recipes: [{ id: "r1", name: "Moss", notes: "", createdAt: date, steps: [] }],
      projects: [{ id: "p1", name: "Orcs", notes: "", createdAt: date, recipeIds: ["r1"], mixIds: [], photos: [] }],
      paints: [
        { id: "x1", name: "greenskin", brand: "the army painter", swatch: "#000000", status: "want", createdAt: date },
        { id: "x2", name: "Kraken Ink", brand: "The Army Painter", swatch: "#2f4a5f", status: "have", createdAt: date },
      ],
    });
    const result = await localStore.importArchive(incoming, { mode: "merge", label: "imported" });
    expect(result.addedOther).toEqual({ recipes: 1, projects: 1, paints: 1 });
    expect(result.archive.paints.map((paint) => paint.name)).toEqual(["Greenskin", "Kraken Ink"]);
    // Importing the same file again adds nothing.
    expect((await localStore.importArchive(incoming, { mode: "merge", label: "imported" })).addedOther).toEqual({ recipes: 0, projects: 0, paints: 0 });
  });

  it("replaces the archive with a backup", async () => {
    await localStore.saveMix(recipe, null);
    await localStore.saveRecipe({ name: "Moss", notes: "", steps: [] }, null);
    const result = await localStore.importArchive(completeArchive({ collections: [{ id: "c", name: "Empty", mixIds: ["gone"] }] }), { mode: "replace", label: "imported" });
    expect(result.archive.mixes).toHaveLength(0);
    expect(stored().collections[0].mixIds).toEqual([]);
    expect(read(RECIPES_KEY)).toEqual([]);
  });

  it("keeps damaged entries in a recovery copy and reports them", () => {
    localStorage.setItem(MIXES_KEY, JSON.stringify([{ ...recipe, id: "ok", createdAt: "2026-11-01T10:00:00Z" }, { name: 5 }]));
    const { archive, warning } = readLocalArchive();
    expect(archive.mixes).toHaveLength(1);
    expect(warning).toContain("1 saved mix was damaged");
    expect(localStorage.getItem(RECOVERY_KEY)).toContain('"name":5');
  });

  it("skips damaged recipes, projects and paints without losing the rest", () => {
    localStorage.setItem(PAINTS_KEY, JSON.stringify([{ id: "a", name: "Ok", brand: "", swatch: "#112233", status: "have", createdAt: date }, { id: "b", name: "Bad", status: "stolen" }]));
    localStorage.setItem(PROJECTS_KEY, "not json");
    const { archive, warning } = readLocalArchive();
    expect(archive.paints.map((paint) => paint.id)).toEqual(["a"]);
    expect(archive.projects).toEqual([]);
    expect(warning).toContain("projects could not be loaded");
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
