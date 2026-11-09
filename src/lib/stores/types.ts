import type { Archive, Collection, CollectionInput, ImportMode, ImportResult, Mix, MixInput } from "../../types";

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
  /** Deletes a mix and removes it from every collection. */
  deleteMix(mix: Mix): Promise<void>;
  saveCollection(values: CollectionInput, existing: Collection | null): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;
  /** Adds (merge) or swaps in (replace) a whole archive. `label` names renamed collections, e.g. "shared". */
  importArchive(archive: Archive, options: { mode: ImportMode; label: string; failureMessage?: string }): Promise<ImportResult>;
  /** The archive as a backup file needs it: every photo embedded as a data URL. */
  prepareExport(archive: Archive): Promise<Archive>;
}
