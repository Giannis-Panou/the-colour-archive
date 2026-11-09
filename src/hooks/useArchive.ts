import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Archive, Collection, CollectionInput, ImportMode, ImportResult, Mix, MixInput } from "../types";
import { describeStoreError } from "../lib/errors";
import { createCloudStore } from "../lib/stores/cloudStore";
import { localStore, readLocalArchive } from "../lib/stores/localStore";
import type { ArchiveStore } from "../lib/stores/types";

const EMPTY: Archive = { mixes: [], collections: [] };

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

  const saveMix = useCallback(async (values: MixInput, existing: Mix | null) => {
    const saved = await run(() => store.saveMix(values, existing), "This mix couldn't be saved to your account. Try again in a moment.");
    if (saved) update((previous) => ({
      ...previous,
      mixes: existing ? previous.mixes.map((mix) => (mix.id === saved.id ? saved : mix)) : [saved, ...previous.mixes],
    }));
    return saved;
  }, [run, store, update]);

  const deleteMix = useCallback(async (mix: Mix) => {
    const done = await run(async () => { await store.deleteMix(mix); return true; }, "This mix couldn't be deleted. Try again in a moment.");
    if (done) update((previous) => ({
      mixes: previous.mixes.filter((item) => item.id !== mix.id),
      collections: previous.collections.map((collection) => ({ ...collection, mixIds: collection.mixIds.filter((id) => id !== mix.id) })),
    }));
    return Boolean(done);
  }, [run, store, update]);

  const saveCollection = useCallback(async (values: CollectionInput, existing: Collection | null) => {
    const saved = await run(() => store.saveCollection(values, existing), "This collection couldn't be saved to your account. Try again in a moment.");
    if (saved) update((previous) => ({
      ...previous,
      collections: existing ? previous.collections.map((collection) => (collection.id === saved.id ? saved : collection)) : [...previous.collections, saved],
    }));
    return saved;
  }, [run, store, update]);

  const deleteCollection = useCallback(async (id: string) => {
    const done = await run(async () => { await store.deleteCollection(id); return true; }, "This collection couldn't be deleted. Try again in a moment.");
    if (done) update((previous) => ({ ...previous, collections: previous.collections.filter((collection) => collection.id !== id) }));
    return Boolean(done);
  }, [run, store, update]);

  const importArchive = useCallback(async (incoming: Archive, options: { mode: ImportMode; label: string; failureMessage?: string }): Promise<ImportResult | null> => {
    const result = await run(() => store.importArchive(incoming, options), options.failureMessage || "The backup couldn't be imported to your account. Try again in a moment.");
    if (result) update(() => result.archive);
    return result;
  }, [run, store, update]);

  /** The archive with every photo embedded, ready to write to a backup file. */
  const exportableArchive = useCallback(() => run(() => store.prepareExport(archive), "The backup could not be created. Please try again."), [run, store, archive]);

  return {
    kind: store.kind,
    mixes: archive.mixes,
    collections: archive.collections,
    loading: waitingForAuth || !current,
    loadFailed: current && loaded.failed,
    error,
    setError,
    busy,
    reload: useCallback(() => setReloadCount((count) => count + 1), []),
    saveMix,
    deleteMix,
    saveCollection,
    deleteCollection,
    importArchive,
    exportableArchive,
  };
}

export type ArchiveApi = ReturnType<typeof useArchive>;
