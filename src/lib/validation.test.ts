import { describe, expect, it } from "vitest";
import { isStoredMix, isValidCollection, isValidMix, isValidSharePayload, plural, uniqueName } from "./validation";

const mix = { name: "Dragon scale red", color: "#7e1f1c", notes: "", image: "", paints: [{ name: "Mephiston Red", brand: "Citadel", drops: "3", swatch: "#9a1115" }] };

describe("isValidMix", () => {
  it("accepts a complete recipe", () => {
    expect(isValidMix(mix)).toBe(true);
  });

  it.each([
    ["a colour that isn't hex", { ...mix, color: "red" }],
    ["CSS injection in the colour", { ...mix, color: "red;background:url(x)" }],
    ["a javascript: photo", { ...mix, image: "javascript:alert(1)" }],
    ["a remote photo", { ...mix, image: "https://example.com/x.png" }],
    ["an SVG photo", { ...mix, image: "data:image/svg+xml;base64,PHN2Zz4=" }],
    ["numeric drops", { ...mix, paints: [{ ...mix.paints[0], drops: 3 }] }],
    ["missing paints", { ...mix, paints: undefined }],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isValidMix(value)).toBe(false);
  });

  it("accepts embedded JPEG, PNG and WebP photos", () => {
    for (const type of ["jpeg", "png", "webp"]) expect(isValidMix({ ...mix, image: `data:image/${type};base64,AAAA` })).toBe(true);
  });

  it("only accepts share-photo links when asked to", () => {
    const link = "https://example.supabase.co/storage/v1/object/public/share-photos/Ab3xK9q2Zz/0.jpg";
    expect(isValidMix({ ...mix, image: link })).toBe(false);
  });
});

describe("isStoredMix", () => {
  it("needs an id and a valid date", () => {
    expect(isStoredMix({ ...mix, id: "a", createdAt: "2026-11-01T10:00:00Z" })).toBe(true);
    expect(isStoredMix({ ...mix, id: "", createdAt: "2026-11-01T10:00:00Z" })).toBe(false);
    expect(isStoredMix({ ...mix, id: "a", createdAt: "not a date" })).toBe(false);
  });
});

describe("isValidCollection", () => {
  it("needs string ids", () => {
    expect(isValidCollection({ id: "c", name: "Bases", mixIds: ["a"] })).toBe(true);
    expect(isValidCollection({ id: "c", name: "Bases", mixIds: [1] })).toBe(false);
  });
});

describe("isValidSharePayload", () => {
  it("accepts a mix or a collection", () => {
    expect(isValidSharePayload({ version: 1, kind: "mix", mix })).toBe(true);
    expect(isValidSharePayload({ version: 1, kind: "collection", name: "Set", mixes: [mix, mix] })).toBe(true);
  });

  it("rejects other versions, kinds and broken mixes", () => {
    expect(isValidSharePayload({ version: 2, kind: "mix", mix })).toBe(false);
    expect(isValidSharePayload({ version: 1, kind: "palette", mix })).toBe(false);
    expect(isValidSharePayload({ version: 1, kind: "collection", name: "Set", mixes: [{ ...mix, color: "x" }] })).toBe(false);
  });
});

describe("uniqueName", () => {
  it("keeps a free name and numbers clashes, ignoring case", () => {
    expect(uniqueName("Cloaks", "shared", ["Bases"])).toBe("Cloaks");
    expect(uniqueName("Cloaks", "shared", ["cloaks"])).toBe("Cloaks (shared)");
    expect(uniqueName("Cloaks", "shared", ["Cloaks", "Cloaks (shared)"])).toBe("Cloaks (shared 2)");
  });
});

describe("plural", () => {
  it("picks singular or plural", () => {
    expect(plural(1, "mix", "mixes")).toBe("1 mix");
    expect(plural(3, "mix", "mixes")).toBe("3 mixes");
    expect(plural(2, "collection")).toBe("2 collections");
  });
});
