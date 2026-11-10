export interface Paint {
  name: string;
  brand: string;
  /** Drop count as typed, e.g. "3". Kept as text so backups and share links round-trip exactly. */
  drops: string;
  swatch: string;
}

/** The recipe fields a mix form produces, and what share links carry. */
export interface MixInput {
  name: string;
  color: string;
  notes: string;
  /** "" for no photo, a data: URL, or (signed in / shared) a link to the stored photo. */
  image: string;
  paints: Paint[];
}

export interface Mix extends MixInput {
  id: string;
  createdAt: string;
  /** Cloud only: the photo's location in the private mix-photos bucket. */
  imagePath?: string | null;
  /** Starred mixes sit at the top of the archive. */
  favorite?: boolean;
}

export interface Collection {
  id: string;
  name: string;
  mixIds: string[];
  createdAt?: string;
}

/** "have": on the shelf; "low": running out; "want": not owned yet, on the wishlist. */
export type PaintStatus = "have" | "low" | "want";

/** A paint in "My paints". */
export interface PaintInput {
  name: string;
  brand: string;
  swatch: string;
  status: PaintStatus;
}

export interface OwnedPaint extends PaintInput {
  id: string;
  createdAt: string;
}

/** One step of a recipe: a role (base, shade…) painted with a saved mix or a single paint. */
export interface RecipeStep {
  role: string;
  /** A mix from the archive, or null when the step uses a single paint. */
  mixId: string | null;
  /** The single paint's name when mixId is null. */
  paint: string;
  note: string;
}

export interface RecipeInput {
  name: string;
  notes: string;
  steps: RecipeStep[];
}

export interface Recipe extends RecipeInput {
  id: string;
  createdAt: string;
}

export interface ProjectPhoto {
  id: string;
  /** A data: URL, or (signed in) a temporary link to the stored photo. */
  image: string;
  /** Cloud only: the photo's location in the private mix-photos bucket. */
  path?: string | null;
  caption: string;
  addedAt: string;
}

export interface ProjectInput {
  name: string;
  notes: string;
  recipeIds: string[];
  mixIds: string[];
}

export interface Project extends ProjectInput {
  id: string;
  createdAt: string;
  photos: ProjectPhoto[];
}

export interface Archive {
  mixes: Mix[];
  collections: Collection[];
  recipes: Recipe[];
  projects: Project[];
  paints: OwnedPaint[];
}

export interface CollectionInput {
  id?: string;
  name: string;
  mixIds: string[];
}

export type ImportMode = "merge" | "replace";

export interface ImportResult {
  archive: Archive;
  addedMixes: number;
  skippedMixes: number;
  addedCollections: number;
  /** Recipes, projects and paints added. */
  addedOther: { recipes: number; projects: number; paints: number };
}

export type SharePayload =
  | { version: 1; kind: "mix"; mix: MixInput }
  | { version: 1; kind: "collection"; name: string; mixes: MixInput[] };

/** What the share route shows: nothing, a spinner, a recipe, or an error. */
export type SharedLinkState =
  | null
  | { status: "loading" }
  | { status: "ready"; payload: SharePayload }
  | { status: "error"; message: string };

export interface ShareTarget {
  kind: "mix" | "collection";
  title: string;
  mixes: Mix[];
  name?: string;
}

export interface ShareLinkResult {
  url: string;
  short: boolean;
  photosIncluded: number;
  photosOmitted: number;
}
