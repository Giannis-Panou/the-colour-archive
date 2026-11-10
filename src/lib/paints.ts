import type { Mix, OwnedPaint, PaintStatus, Recipe } from "../types";
import { paintKey } from "./validation";

export const STATUS_LABELS: Record<PaintStatus, string> = { have: "On the shelf", low: "Running low", want: "Wishlist" };

export const DEFAULT_BRANDS = ["The Army Painter", "Citadel", "Vallejo", "AK Interactive", "Scale75", "Pro Acryl", "Other"];

/** A paint the archive uses: where it appears, and the swatch it was last saved with. */
export interface PaintUse {
  key: string;
  name: string;
  /** "" for a single paint in a recipe step, which only records its name. */
  brand: string;
  swatch: string;
  mixIds: string[];
  recipeIds: string[];
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Looks up paints on "My paints" by brand and name, or by name alone when the brand isn't known. */
export class PaintShelf {
  private readonly byKey = new Map<string, OwnedPaint>();
  private readonly byName = new Map<string, OwnedPaint>();
  readonly isEmpty: boolean;

  constructor(paints: OwnedPaint[]) {
    for (const paint of paints) {
      this.byKey.set(paintKey(paint.brand, paint.name), paint);
      if (!this.byName.has(nameKey(paint.name))) this.byName.set(nameKey(paint.name), paint);
    }
    this.isEmpty = paints.length === 0;
  }

  /** The entry on the list for this paint, whatever its status. */
  find(brand: string, name: string): OwnedPaint | undefined {
    return (brand ? this.byKey.get(paintKey(brand, name)) : undefined) ?? (brand && brand !== "Other" ? undefined : this.byName.get(nameKey(name)));
  }

  /** On the shelf: listed as "have" or "low". Wishlist paints aren't owned yet. */
  owns(brand: string, name: string): boolean {
    const paint = this.find(brand, name);
    return Boolean(paint && paint.status !== "want");
  }
}

/** Every paint used by a mix or a recipe step, merged by brand and name. */
export function paintsInUse(mixes: Mix[], recipes: Recipe[]): PaintUse[] {
  const uses = new Map<string, PaintUse>();
  for (const mix of mixes) {
    for (const paint of mix.paints) {
      if (!paint.name.trim()) continue;
      const key = paintKey(paint.brand, paint.name);
      const use = uses.get(key) ?? { key, name: paint.name.trim(), brand: paint.brand, swatch: paint.swatch, mixIds: [], recipeIds: [] };
      if (!use.mixIds.includes(mix.id)) use.mixIds.push(mix.id);
      uses.set(key, use);
    }
  }
  // Recipe steps name a single paint without a brand; they join a mix paint with the same name.
  const byName = new Map([...uses.values()].map((use) => [nameKey(use.name), use]));
  for (const recipe of recipes) {
    for (const step of recipe.steps) {
      if (step.mixId || !step.paint.trim()) continue;
      let use = byName.get(nameKey(step.paint));
      if (!use) {
        use = { key: paintKey("", step.paint), name: step.paint.trim(), brand: "", swatch: "", mixIds: [], recipeIds: [] };
        uses.set(use.key, use);
        byName.set(nameKey(step.paint), use);
      }
      if (!use.recipeIds.includes(recipe.id)) use.recipeIds.push(recipe.id);
    }
  }
  return [...uses.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type ShoppingItem =
  | { kind: "low" | "want"; paint: OwnedPaint; use?: PaintUse }
  | { kind: "missing"; use: PaintUse };

/**
 * What to buy: paints marked as running low, wishlist paints, and paints the archive uses that
 * aren't on "My paints" at all. Missing paints only count once My paints has something on it,
 * so someone who doesn't keep a paint list isn't told they own nothing.
 */
export function shoppingList(paints: OwnedPaint[], uses: PaintUse[]): ShoppingItem[] {
  const shelf = new PaintShelf(paints);
  const useFor = (paint: OwnedPaint) => uses.find((use) => (use.brand ? use.key === paintKey(paint.brand, paint.name) : nameKey(use.name) === nameKey(paint.name)));
  const listed: ShoppingItem[] = paints
    .filter((paint) => paint.status !== "have")
    .map((paint) => ({ kind: paint.status as "low" | "want", paint, use: useFor(paint) }));
  const missing: ShoppingItem[] = shelf.isEmpty ? [] : uses
    .filter((use) => !shelf.find(use.brand, use.name))
    .map((use) => ({ kind: "missing", use }));
  const order = { low: 0, want: 1, missing: 2 };
  return [...listed, ...missing].sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The shopping list as plain text, for pasting into a note or a message. */
export function shoppingListText(items: ShoppingItem[]): string {
  const line = (name: string, brand: string, note: string) => `- ${name}${brand ? ` (${brand})` : ""}${note ? ` – ${note}` : ""}`;
  return ["Paint shopping list", ...items.map((item) => (item.kind === "missing"
    ? line(item.use.name, item.use.brand, "not on my shelf")
    : line(item.paint.name, item.paint.brand, item.kind === "low" ? "running low" : "wishlist")))].join("\n");
}
