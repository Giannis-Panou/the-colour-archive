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
}

export interface Collection {
  id: string;
  name: string;
  mixIds: string[];
  createdAt?: string;
}

export interface Archive {
  mixes: Mix[];
  collections: Collection[];
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
