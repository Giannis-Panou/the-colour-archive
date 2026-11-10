import { describe, expect, it } from "vitest";
import { completeArchive } from "./archive";
import { createBackupFile, parseBackup } from "./backup";

const date = "2026-11-01T10:00:00.000Z";
const mix = { id: "m1", createdAt: date, name: "Bone white", color: "#d9cfb4", notes: "", image: "", paints: [] };
const recipe = { id: "r1", createdAt: date, name: "Bone armour", notes: "", steps: [{ role: "Base", mixId: "m1", paint: "", note: "" }] };
const project = { id: "p1", createdAt: date, name: "Skeletons", notes: "", recipeIds: ["r1"], mixIds: [], photos: [{ id: "ph1", image: "data:image/png;base64,iVBORw0KGgo=", caption: "Primed", addedAt: date }] };
const paint = { id: "pa1", createdAt: date, name: "Wraithbone", brand: "Citadel", swatch: "#e8dcc0", status: "have" };
const backup = (overrides: object = {}) => JSON.stringify({ app: "the-colour-archive", version: 2, mixes: [mix], collections: [{ id: "c1", name: "Bases", mixIds: ["m1"] }], recipes: [recipe], projects: [project], paints: [paint], ...overrides });

describe("parseBackup", () => {
  it("reads a valid backup", () => {
    const archive = parseBackup(backup());
    expect(archive.mixes).toHaveLength(1);
    expect(archive.collections[0].name).toBe("Bases");
    expect(archive.recipes[0].steps[0].mixId).toBe("m1");
    expect(archive.projects[0].photos[0].caption).toBe("Primed");
    expect(archive.paints[0].status).toBe("have");
  });

  it("still reads version 1 backups, which only had mixes and collections", () => {
    const archive = parseBackup(JSON.stringify({ app: "the-colour-archive", version: 1, mixes: [mix], collections: [] }));
    expect(archive).toMatchObject({ mixes: [mix], recipes: [], projects: [], paints: [] });
  });

  it.each([
    ["text that isn't JSON", "hello", "could not be read as JSON"],
    ["another app's file", backup({ app: "other" }), "isn’t a Colour Archive backup"],
    ["a different version", backup({ version: 3 }), "different version"],
    ["a damaged mix", backup({ mixes: [{ ...mix, color: "red" }] }), "1 damaged mix"],
    ["damaged collections", backup({ collections: [{ id: "c", name: "x", mixIds: [1] }] }), "damaged collection data"],
    ["a mix listed twice", backup({ mixes: [mix, mix] }), "same mix more than once"],
    ["a damaged recipe", backup({ recipes: [{ ...recipe, steps: [{ role: "Base" }] }] }), "damaged recipe data"],
    ["a project photo that isn't an image", backup({ projects: [{ ...project, photos: [{ ...project.photos[0], image: "https://example.com/x.png" }] }] }), "damaged project data"],
    ["a paint with an unknown status", backup({ paints: [{ ...paint, status: "stolen" }] }), "damaged paint data"],
  ])("refuses %s", (_label, text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });

  it("ignores __proto__ keys instead of polluting objects", () => {
    parseBackup(backup().replace('"mixes":[{', '"__proto__":{"polluted":true},"mixes":[{"__proto__":{"polluted":true},'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("createBackupFile", () => {
  it("names the file by date and leaves storage paths out", async () => {
    const archive = completeArchive({
      mixes: [{ ...mix, imagePath: "user/m1.jpg" }],
      projects: [{ ...project, photos: [{ ...project.photos[0], path: "user/project-p1.jpg" }] }],
    });
    const { blob, filename } = createBackupFile(archive, new Date(2026, 10, 9));
    expect(filename).toBe("colour-archive-2026-11-09.json");
    const data = JSON.parse(await blob.text());
    expect(data).toMatchObject({ app: "the-colour-archive", version: 2 });
    expect(data.mixes[0]).not.toHaveProperty("imagePath");
    expect(data.projects[0].photos[0]).not.toHaveProperty("path");
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.mixes).toHaveLength(1);
    expect(restored.projects).toHaveLength(1);
  });
});
