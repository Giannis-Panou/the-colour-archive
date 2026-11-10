// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Mix, OwnedPaint, Recipe } from "../types";
import { PaintShelf, paintsInUse, shoppingList, shoppingListText } from "./paints";

const paint = (name: string, brand: string, status: OwnedPaint["status"] = "have"): OwnedPaint => ({
  id: `${brand}-${name}`, name, brand, swatch: "#445566", status, createdAt: "2026-11-01T10:00:00.000Z",
});
const mix = (id: string, paints: [string, string][]): Mix => ({
  id, name: id, color: "#556677", notes: "", image: "", createdAt: "2026-11-01T10:00:00.000Z",
  paints: paints.map(([name, brand]) => ({ name, brand, drops: "1", swatch: "#112233" })),
});
const recipe = (id: string, paints: string[], mixIds: string[] = []): Recipe => ({
  id, name: id, notes: "", createdAt: "2026-11-01T10:00:00.000Z",
  steps: [...paints.map((name) => ({ role: "Base", mixId: null, paint: name, note: "" })), ...mixIds.map((mixId) => ({ role: "Layer", mixId, paint: "", note: "" }))],
});

describe("PaintShelf", () => {
  const shelf = new PaintShelf([paint("Abaddon Black", "Citadel"), paint("Kraken Ink", "The Army Painter", "want")]);

  it("matches brand and name, ignoring case and spacing", () => {
    expect(shelf.owns("citadel", "  abaddon   black ")).toBe(true);
    expect(shelf.owns("Vallejo", "Abaddon Black")).toBe(false);
  });

  it("counts wishlist paints as not owned", () => {
    expect(shelf.find("The Army Painter", "Kraken Ink")?.status).toBe("want");
    expect(shelf.owns("The Army Painter", "Kraken Ink")).toBe(false);
  });

  it("matches by name alone when the brand isn't known", () => {
    expect(shelf.owns("", "Abaddon Black")).toBe(true);
    expect(shelf.owns("Other", "Abaddon black")).toBe(true);
  });
});

describe("paintsInUse", () => {
  it("merges mix paints by brand and name and joins recipe paints by name", () => {
    const uses = paintsInUse(
      [mix("m1", [["Abaddon Black", "Citadel"], ["Wraithbone", "Citadel"]]), mix("m2", [["abaddon black", "Citadel"]])],
      [recipe("r1", ["Abaddon Black", "Nuln Oil"], ["m1"])],
    );
    expect(uses.map((use) => use.name)).toEqual(["Abaddon Black", "Nuln Oil", "Wraithbone"]);
    expect(uses[0]).toMatchObject({ mixIds: ["m1", "m2"], recipeIds: ["r1"] });
    expect(uses[1]).toMatchObject({ brand: "", mixIds: [], recipeIds: ["r1"] });
  });
});

describe("shoppingList", () => {
  it("lists low, then wishlist, then paints used but not on the list", () => {
    const paints = [paint("Wraithbone", "Citadel", "low"), paint("Kraken Ink", "The Army Painter", "want"), paint("Abaddon Black", "Citadel")];
    const uses = paintsInUse([mix("m1", [["Abaddon Black", "Citadel"], ["Wraithbone", "Citadel"], ["Retributor Armour", "Citadel"]])], []);
    const items = shoppingList(paints, uses);
    expect(items.map((item) => item.kind)).toEqual(["low", "want", "missing"]);
    expect(items[0]).toMatchObject({ use: { mixIds: ["m1"] } });
    expect(shoppingListText(items)).toBe([
      "Paint shopping list",
      "- Wraithbone (Citadel) – running low",
      "- Kraken Ink (The Army Painter) – wishlist",
      "- Retributor Armour (Citadel) – not on my shelf",
    ].join("\n"));
  });

  it("leaves out missing paints until My paints has something on it", () => {
    const uses = paintsInUse([mix("m1", [["Abaddon Black", "Citadel"]])], []);
    expect(shoppingList([], uses)).toEqual([]);
  });
});
