import { describe, expect, it } from "vitest";
import { createBackupFile, parseBackup } from "./backup";

const mix = { id: "m1", createdAt: "2026-11-01T10:00:00.000Z", name: "Bone white", color: "#d9cfb4", notes: "", image: "", paints: [] };
const backup = (overrides: object = {}) => JSON.stringify({ app: "the-colour-archive", version: 1, mixes: [mix], collections: [{ id: "c1", name: "Bases", mixIds: ["m1"] }], ...overrides });

describe("parseBackup", () => {
  it("reads a valid backup", () => {
    const archive = parseBackup(backup());
    expect(archive.mixes).toHaveLength(1);
    expect(archive.collections[0].name).toBe("Bases");
  });

  it.each([
    ["text that isn't JSON", "hello", "could not be read as JSON"],
    ["another app's file", backup({ app: "other" }), "isn’t a Colour Archive backup"],
    ["a different version", backup({ version: 2 }), "different version"],
    ["a damaged mix", backup({ mixes: [{ ...mix, color: "red" }] }), "1 damaged mix"],
    ["damaged collections", backup({ collections: [{ id: "c", name: "x", mixIds: [1] }] }), "damaged collection data"],
    ["a mix listed twice", backup({ mixes: [mix, mix] }), "same mix more than once"],
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
    const { blob, filename } = createBackupFile({ mixes: [{ ...mix, imagePath: "user/m1.jpg" }], collections: [] }, new Date(2026, 10, 9));
    expect(filename).toBe("colour-archive-2026-11-09.json");
    const data = JSON.parse(await blob.text());
    expect(data).toMatchObject({ app: "the-colour-archive", version: 1 });
    expect(data.mixes[0]).not.toHaveProperty("imagePath");
    expect(parseBackup(JSON.stringify(data)).mixes).toHaveLength(1);
  });
});
