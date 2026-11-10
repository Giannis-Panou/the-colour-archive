// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBackup } from "./backup";
import { paintsInUse, shoppingList } from "./paints";

const read = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "..", "..", name), "utf8");

describe("sample files", () => {
  it("sample-archive.json is a valid backup", () => {
    const archive = parseBackup(read("sample-archive.json"));
    expect(archive.mixes).toHaveLength(14);
    expect(archive.collections).toHaveLength(3);
  });

  it("sample-workshop.json has a little of everything, and every reference points at something real", () => {
    const archive = parseBackup(read("sample-workshop.json"));
    const mixIds = new Set(archive.mixes.map((mix) => mix.id));
    const recipeIds = new Set(archive.recipes.map((recipe) => recipe.id));

    expect(archive.mixes.some((mix) => mix.favorite)).toBe(true);
    expect(archive.collections.length).toBeGreaterThan(0);
    expect(archive.recipes.length).toBeGreaterThan(0);
    expect(archive.projects.some((project) => project.photos.length > 0)).toBe(true);
    expect(new Set(archive.paints.map((paint) => paint.status))).toEqual(new Set(["have", "low", "want"]));

    for (const collection of archive.collections) expect(collection.mixIds.every((id) => mixIds.has(id)), collection.name).toBe(true);
    for (const recipe of archive.recipes) {
      expect(recipe.steps.every((step) => step.mixId === null ? step.paint.trim() !== "" : mixIds.has(step.mixId)), recipe.name).toBe(true);
    }
    for (const project of archive.projects) {
      expect(project.recipeIds.every((id) => recipeIds.has(id)), project.name).toBe(true);
      expect(project.mixIds.every((id) => mixIds.has(id)), project.name).toBe(true);
      expect(project.photos.length).toBeLessThanOrEqual(12);
    }

    // The shopping list has every kind of entry: low, wishlist and missing from the shelf.
    const kinds = new Set(shoppingList(archive.paints, paintsInUse(archive.mixes, archive.recipes)).map((item) => item.kind));
    expect(kinds).toEqual(new Set(["low", "want", "missing"]));
  });
});
