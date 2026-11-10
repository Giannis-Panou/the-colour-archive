import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Archive, Collection, CollectionInput, ImportMode, ImportResult, Mix, MixInput,
  OwnedPaint, PaintInput, Project, ProjectInput, Recipe, RecipeInput,
} from "../types";
import { emptyArchive } from "../lib/archive";
import { describeStoreError } from "../lib/errors";
import { createCloudStore } from "../lib/stores/cloudStore";
import { localStore, readLocalArchive } from "../lib/stores/localStore";
import type { ArchiveStore } from "../lib/stores/types";

const EMPTY: Archive = emptyArchive();

interface Options {
  user: User | null;
  authReady: boolean;
  /** A saved sign-in exists, so wait for the account instead of showing this browser's archive first. */
  startsSignedIn: boolean;
}

/** What was last loaded, and for which store and reload; anything else on screen is still loading. */
interface Loaded {
  key: string;
  archive: Archive;
  failed: boolean;
}

type ItemList = "mixes" | "recipes" | "projects" | "paints";

/** Puts a saved item into its list: replaces the one with its id, or adds it. */
function place<T extends { id: string }>(list: T[], item: T, newAt: "start" | "end"): T[] {
  if (list.some((entry) => entry.id === item.id)) return list.map((entry) => (entry.id === item.id ? item : entry));
  return newAt === "start" ? [item, ...list] : [...list, item];
}

/**
 * The archive on screen and every change to it. Signed out it uses browser storage, signed in it
 * uses Supabase; callers never need to know which.
 */
export function useArchive({ user, authReady, startsSignedIn }: Options) {
  const userId = user?.id ?? null;
  const store: ArchiveStore = useMemo(() => (userId ? createCloudStore(userId) : localStore), [userId]);
  const waitingForAuth = startsSignedIn && !authReady;
  const [reloadCount, setReloadCount] = useState(0);
  const loadKey = `${userId ?? "local"}:${reloadCount}`;

  // Signed out, the browser archive is read synchronously so the first render already shows it.
  const [loaded, setLoaded] = useState<Loaded>(() => (startsSignedIn
    ? { key: "", archive: EMPTY, failed: false }
    : { key: "local:0", archive: readLocalArchive().archive, failed: false }));
  const [error, setError] = useState(() => (startsSignedIn ? "" : readLocalArchive().warning));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (waitingForAuth) return undefined;
    let cancelled = false;
    store.load().then(
      ({ archive, warning }) => {
        if (cancelled) return;
        setLoaded({ key: loadKey, archive, failed: false });
        setError(warning);
      },
      (loadError: unknown) => {
        if (cancelled) return;
        console.error("Could not load the archive:", loadError);
        setLoaded({ key: loadKey, archive: EMPTY, failed: true });
        setError(describeStoreError(loadError, "Your archive couldn't be loaded from your account. Try again in a moment."));
      },
    );
    return () => { cancelled = true; };
  }, [store, waitingForAuth, loadKey]);

  // Until this store's data arrives, show nothing rather than the previous store's (e.g. after signing out).
  const current = loaded.key === loadKey;
  const archive = current ? loaded.archive : EMPTY;
  const update = useCallback((change: (archive: Archive) => Archive) => {
    setLoaded((previous) => ({ ...previous, archive: change(previous.archive) }));
  }, []);

  /** Runs one change. Returns its result, or null after recording a readable error. */
  const run = useCallback(async <T,>(task: () => Promise<T>, fallback: string): Promise<T | null> => {
    setBusy(true);
    try {
      const result = await task();
      setError("");
      return result;
    } catch (taskError) {
      console.error(fallback, taskError);
      setError(describeStoreError(taskError, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Runs a change that saves one item, then puts the saved item into its list on screen. */
  const saveInto = useCallback(async <T extends { id: string }>(list: ItemList, task: () => Promise<T>, fallback: string, newAt: "start" | "end" = "start") => {
    const saved = await run(task, fallback);
    if (saved) update((previous) => ({ ...previous, [list]: place(previous[list] as unknown as T[], saved, newAt) }));
    return saved;
  }, [run, update]);

  /** Runs a delete, then takes the item off the screen. */
  const removeFrom = useCallback(async (list: Exclude<ItemList, "mixes">, id: string, task: () => Promise<void>, fallback: string) => {
    const done = await run(async () => { await task(); return true; }, fallback);
    if (done) update((previous) => ({ ...previous, [list]: (previous[list] as { id: string }[]).filter((item) => item.id !== id) }));
    return Boolean(done);
  }, [run, update]);

  const saveMix = useCallback((values: MixInput, existing: Mix | null) => saveInto("mixes",
    () => store.saveMix(values, existing), "This mix couldn't be saved to your account. Try again in a moment."), [saveInto, store]);

  const setFavorite = useCallback((mix: Mix, favorite: boolean) => saveInto("mixes",
    () => store.setFavorite(mix, favorite), "This mix couldn't be updated. Try again in a moment."), [saveInto, store]);

  const deleteMix = useCallback(async (mix: Mix) => {
    const done = await run(async () => { await store.deleteMix(mix); return true; }, "This mix couldn't be deleted. Try again in a moment.");
    if (done) update((previous) => ({
      ...previous,
      mixes: previous.mixes.filter((item) => item.id !== mix.id),
      collections: previous.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => id !== mix.id) })),
    }));
    return Boolean(done);
  }, [run, store, update]);

  const deleteMixes = useCallback(async (selected: Mix[]) => {
    const ids = new Set(selected.map((mix) => mix.id));
    const done = await run(async () => { await store.deleteMixes(selected); return true; }, "These mixes couldn't be deleted. Try again in a moment.");
    if (done) update((previous) => ({
      ...previous,
      mixes: previous.mixes.filter((item) => !ids.has(item.id)),
      collections: previous.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => !ids.has(id)) })),
    }));
    return Boolean(done);
  }, [run, store, update]);

  const deletePaints = useCallback(async (paintIds: string[]) => {
    const ids = new Set(paintIds);
    const done = await run(async () => { await store.deletePaints(paintIds); return true; }, "These paints couldn't be removed. Try again in a moment.");
    if (done) update((previous) => ({ ...previous, paints: previous.paints.filter((paint) => !ids.has(paint.id)) }));
    return Boolean(done);
  }, [run, store, update]);

  const saveCollection = useCallback(async (values: CollectionInput, existing: Collection | null) => {
    const saved = await run(() => store.saveCollection(values, existing), "This collection couldn't be saved to your account. Try again in a moment.");
    if (saved) update((previous) => ({ ...previous, collections: place(previous.collections, saved, "end") }));
    return saved;
  }, [run, store, update]);

  const deleteCollection = useCallback(async (id: string) => {
    const done = await run(async () => { await store.deleteCollection(id); return true; }, "This collection couldn't be deleted. Try again in a moment.");
    if (done) update((previous) => ({ ...previous, collections: previous.collections.filter((collection) => collection.id !== id) }));
    return Boolean(done);
  }, [run, store, update]);

  const saveRecipe = useCallback((values: RecipeInput, existing: Recipe | null) => saveInto("recipes",
    () => store.saveRecipe(values, existing), "This recipe couldn't be saved. Try again in a moment."), [saveInto, store]);
  const deleteRecipe = useCallback((id: string) => removeFrom("recipes", id,
    () => store.deleteRecipe(id), "This recipe couldn't be deleted. Try again in a moment."), [removeFrom, store]);

  const saveProject = useCallback((values: ProjectInput, existing: Project | null) => saveInto("projects",
    () => store.saveProject(values, existing), "This project couldn't be saved. Try again in a moment."), [saveInto, store]);
  const deleteProject = useCallback((project: Project) => removeFrom("projects", project.id,
    () => store.deleteProject(project), "This project couldn't be deleted. Try again in a moment."), [removeFrom, store]);
  const addProjectPhoto = useCallback((project: Project, image: string, caption: string) => saveInto("projects",
    () => store.addProjectPhoto(project, image, caption), "This photo couldn't be saved. Try again in a moment."), [saveInto, store]);
  const removeProjectPhoto = useCallback((project: Project, photoId: string) => saveInto("projects",
    () => store.removeProjectPhoto(project, photoId), "This photo couldn't be removed. Try again in a moment."), [saveInto, store]);

  const savePaint = useCallback((values: PaintInput, existing: OwnedPaint | null) => saveInto("paints",
    () => store.savePaint(values, existing), "This paint couldn't be saved. Try again in a moment.", "end"), [saveInto, store]);
  const deletePaint = useCallback((id: string) => removeFrom("paints", id,
    () => store.deletePaint(id), "This paint couldn't be removed. Try again in a moment."), [removeFrom, store]);

  const importArchive = useCallback(async (incoming: Archive, options: { mode: ImportMode; label: string; failureMessage?: string }): Promise<ImportResult | null> => {
    const result = await run(() => store.importArchive(incoming, options), options.failureMessage || "The backup couldn't be imported to your account. Try again in a moment.");
    if (result) update(() => result.archive);
    return result;
  }, [run, store, update]);

  /** The archive with every photo embedded, ready to write to a backup file. */
  const exportableArchive = useCallback(() => run(() => store.prepareExport(archive), "The backup could not be created. Please try again."), [run, store, archive]);

  return {
    kind: store.kind,
    archive,
    mixes: archive.mixes,
    collections: archive.collections,
    recipes: archive.recipes,
    projects: archive.projects,
    paints: archive.paints,
    loading: waitingForAuth || !current,
    loadFailed: current && loaded.failed,
    error,
    setError,
    busy,
    reload: useCallback(() => setReloadCount((count) => count + 1), []),
    saveMix,
    setFavorite,
    deleteMix,
    deleteMixes,
    saveCollection,
    deleteCollection,
    saveRecipe,
    deleteRecipe,
    saveProject,
    deleteProject,
    addProjectPhoto,
    removeProjectPhoto,
    savePaint,
    deletePaint,
    deletePaints,
    importArchive,
    exportableArchive,
  };
}

export type ArchiveApi = ReturnType<typeof useArchive>;
