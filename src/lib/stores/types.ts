import type {
  Archive, Collection, CollectionInput, ImportMode, ImportResult, Mix, MixInput,
  OwnedPaint, PaintInput, Project, ProjectInput, Recipe, RecipeInput,
} from "../../types";

/**
 * Where an archive lives. The browser store and the Supabase store implement the same operations,
 * so the rest of the app never branches on whether someone is signed in.
 * Every method throws a StoreError (or an error describeStoreError understands) on failure.
 */
export interface ArchiveStore {
  readonly kind: "local" | "cloud";
  /** Loads everything. `warning` explains anything that couldn't be read. */
  load(): Promise<{ archive: Archive; warning: string }>;
  /** Creates a mix (existing = null) or updates one. Returns the saved mix. */
  saveMix(values: MixInput, existing: Mix | null): Promise<Mix>;
  /** Stars or unstars a mix. */
  setFavorite(mix: Mix, favorite: boolean): Promise<Mix>;
  /** Deletes a mix and removes it from every collection. Recipes and projects keep a gap where it was. */
  deleteMix(mix: Mix): Promise<void>;
  /** Deletes several mixes as one change, removing them from every collection. */
  deleteMixes(mixes: Mix[]): Promise<void>;
  saveCollection(values: CollectionInput, existing: Collection | null): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;

  saveRecipe(values: RecipeInput, existing: Recipe | null): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  /** Creates or updates a project's details. Its photos are kept as they are. */
  saveProject(values: ProjectInput, existing: Project | null): Promise<Project>;
  deleteProject(project: Project): Promise<void>;
  /** Adds a progress photo (a data URL) and returns the updated project. */
  addProjectPhoto(project: Project, image: string, caption: string): Promise<Project>;
  removeProjectPhoto(project: Project, photoId: string): Promise<Project>;
  savePaint(values: PaintInput, existing: OwnedPaint | null): Promise<OwnedPaint>;
  deletePaint(id: string): Promise<void>;
  /** Takes several paints off My paints as one change. */
  deletePaints(ids: string[]): Promise<void>;

  /** Adds (merge) or swaps in (replace) a whole archive. `label` names renamed collections, e.g. "shared". */
  importArchive(archive: Archive, options: { mode: ImportMode; label: string; failureMessage?: string }): Promise<ImportResult>;
  /** The archive as a backup file needs it: every photo embedded as a data URL. */
  prepareExport(archive: Archive): Promise<Archive>;
}
