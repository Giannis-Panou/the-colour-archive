import { Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router";
import type { Archive, Collection, CollectionInput, ImportMode, Mix, MixInput, ShareLinkResult, ShareTarget } from "./types";
import { SetPasswordDialog } from "./components/auth/SetPasswordDialog";
import { SignInDialog } from "./components/auth/SignInDialog";
import { CollectionForm } from "./components/collections/CollectionForm";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { MatchDialog } from "./components/mixes/MatchDialog";
import { MixDetail } from "./components/mixes/MixDetail";
import { MixForm } from "./components/mixes/MixForm";
import { ShareDialog } from "./components/sharing/ShareDialog";
import { SharedPage } from "./components/sharing/SharedPage";
import { useArchive } from "./hooks/useArchive";
import { useAuth } from "./hooks/useAuth";
import { useNotice } from "./hooks/useNotice";
import { useSharedLink } from "./hooks/useSharedLink";
import { useTheme } from "./hooks/useTheme";
import { completeArchive, isArchiveEmpty } from "./lib/archive";
import { createBackupFile, downloadBlob, MAX_BACKUP_FILE_SIZE, parseBackup } from "./lib/backup";
import { imageToDataUrl } from "./lib/images";
import { isNarrowScreen, isSidebarScreen } from "./lib/media";
import { paintsInUse, PaintShelf, shoppingList } from "./lib/paints";
import { createCompressedLink, createShortLink, sharedMixes } from "./lib/sharing";
import { clearLocalArchive, describeCounts, readLocalArchive } from "./lib/stores/localStore";
import { hasStoredSession } from "./lib/supabase";
import { isSharePhotoUrl, plural } from "./lib/validation";
import { ArchivePage } from "./pages/ArchivePage";
import { PaintsPage } from "./pages/PaintsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RecipesPage } from "./pages/RecipesPage";

/** Counts of the newer parts of an archive, e.g. "2 recipes, 1 project and 14 paints". */
function describeOther(counts: Archive | { recipes: number; projects: number; paints: number }): string {
  const count = (value: unknown[] | number) => (typeof value === "number" ? value : value.length);
  const parts = [
    count(counts.recipes) && plural(count(counts.recipes), "recipe"),
    count(counts.projects) && plural(count(counts.projects), "project"),
    count(counts.paints) && plural(count(counts.paints), "paint"),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] || "";
}

const MOVE_DISMISSED_KEY = "the-colour-archive-move-dismissed";

/** Only one dialog is ever open; this says which, with what it needs. */
type Dialog =
  | null
  | { type: "mix"; mix: Mix | null }
  | { type: "collection"; collection: Collection | null }
  | { type: "deleteCollection"; collection: Collection }
  | { type: "import"; archive: Archive }
  | { type: "share"; target: ShareTarget }
  | { type: "match" }
  | { type: "signIn" };

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const shared = useSharedLink();
  const auth = useAuth();
  const [startsSignedIn] = useState(hasStoredSession);
  const archive = useArchive({ user: auth.user, authReady: auth.ready, startsSignedIn });
  const { notice, showNotice } = useNotice();
  const theme = useTheme();

  const [dialog, setDialog] = useState<Dialog>(null);
  // The mix details window opens on top of whatever is open (e.g. Match a colour), so it has its own state.
  const [viewingMixId, setViewingMixId] = useState<string | null>(null);
  const viewingMix = archive.mixes.find((mix) => mix.id === viewingMixId) ?? null;
  const viewMix = useCallback((mix: Mix) => setViewingMixId(mix.id), []);
  const [collectionsExpanded, setCollectionsExpanded] = useState(() => !isNarrowScreen());
  const [sidebarOpen, setSidebarOpen] = useState(isSidebarScreen);
  const [shareError, setShareError] = useState("");
  const [backupError, setBackupError] = useState("");

  const collectionMatch = useMatch("/collections/:collectionId");
  const onProfile = Boolean(useMatch("/profile"));
  const projectMatch = useMatch("/projects/:projectId");
  const onRecipes = Boolean(useMatch("/recipes"));
  const onProjects = Boolean(useMatch("/projects"));
  const onPaints = Boolean(useMatch("/paints"));
  const onShopping = Boolean(useMatch("/paints/shopping"));
  const selectedCollection = archive.collections.find((collection) => collection.id === collectionMatch?.params.collectionId) || null;
  const openProject = archive.projects.find((project) => project.id === projectMatch?.params.projectId);

  // My paints, shared by every page that marks paints you don't own.
  const shelf = useMemo(() => new PaintShelf(archive.paints), [archive.paints]);
  const shoppingCount = useMemo(() => shoppingList(archive.paints, paintsInUse(archive.mixes, archive.recipes)).length, [archive.paints, archive.mixes, archive.recipes]);

  const sectionTitle = onProfile && auth.user ? "Profile"
    : selectedCollection?.name
    ?? (onRecipes ? "Recipes" : onProjects ? "Projects" : projectMatch ? openProject?.name ?? "Project" : onPaints ? "My paints" : onShopping ? "Shopping list" : null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const closeDrawerOnNarrow = useCallback(() => { if (isNarrowScreen()) setCollectionsExpanded(false); }, []);

  // After signing in, offer once to move this browser's archive into the account.
  // `moveAnsweredFor` hides the offer for this visit once it's been answered or closed.
  const userId = auth.user?.id;
  const [moveAnsweredFor, setMoveAnsweredFor] = useState<string | null>(null);
  const moveOffer = useMemo(() => {
    if (!userId || archive.kind !== "cloud" || archive.loading || archive.loadFailed || moveAnsweredFor === userId) return null;
    try { if (localStorage.getItem(MOVE_DISMISSED_KEY) === userId) return null; } catch { /* storage unavailable */ }
    const { archive: local } = readLocalArchive();
    return isArchiveEmpty(local) ? null : local;
  }, [userId, archive.kind, archive.loading, archive.loadFailed, moveAnsweredFor]);

  // Leaving a collection that no longer exists (deleted, replaced by an import) returns to the archive.
  const missingCollection = Boolean(collectionMatch && !selectedCollection && !archive.loading);
  useEffect(() => {
    if (missingCollection) navigate("/", { replace: true });
  }, [missingCollection, navigate]);

  // ---------- Mixes ----------
  async function saveMix(values: MixInput) {
    if (dialog?.type !== "mix") return;
    const saved = await archive.saveMix(values, dialog.mix);
    if (!saved) return;
    setDialog(null);
    showNotice(dialog.mix ? "Mix updated." : "Mix saved to your archive.");
  }

  async function deleteMix(mix: Mix) {
    if (await archive.deleteMix(mix)) showNotice("Mix removed from your archive.");
  }

  async function deleteMixes(mixes: Mix[]) {
    const done = await archive.deleteMixes(mixes);
    if (done) showNotice(`${plural(mixes.length, "mix", "mixes")} removed from your archive.`);
    return done;
  }

  function openMixForm(mix: Mix | null) {
    if (archive.kind === "cloud") archive.setError("");
    setDialog({ type: "mix", mix });
  }

  async function toggleFavorite(mix: Mix) {
    const saved = await archive.setFavorite(mix, !mix.favorite);
    if (saved) showNotice(saved.favorite ? `“${mix.name}” added to favourites.` : `“${mix.name}” removed from favourites.`);
  }

  // ---------- Collections ----------
  async function saveCollection(values: CollectionInput) {
    if (dialog?.type !== "collection") return;
    const saved = await archive.saveCollection(values, dialog.collection);
    if (!saved) return;
    setDialog(null);
    navigate(`/collections/${saved.id}`);
    setCollectionsExpanded(!isNarrowScreen());
    showNotice(dialog.collection ? "Collection updated." : "Collection created.");
  }

  async function deleteCollection() {
    if (dialog?.type !== "deleteCollection") return;
    const { collection } = dialog;
    if (!await archive.deleteCollection(collection.id)) return;
    setDialog(null);
    showNotice(`“${collection.name}” was deleted. Its mixes are still in your archive.`);
  }

  // ---------- Backups ----------
  async function exportBackup() {
    const ready = await archive.exportableArchive();
    if (!ready) return setBackupError("The backup could not be created. Please try again.");
    try {
      const { blob, filename } = createBackupFile(ready);
      downloadBlob(blob, filename);
      setBackupError("");
      const other = describeOther(ready);
      showNotice(`Backup downloaded with ${describeCounts(ready.mixes.length, ready.collections.length)}${other ? `, plus ${other}` : ""}.`, 4000);
    } catch (error) {
      console.error("Could not export the archive:", error);
      setBackupError("The backup could not be created. Please try again.");
    }
  }

  async function chooseBackupFile(file: File) {
    if (file.size > MAX_BACKUP_FILE_SIZE) return setBackupError("This file is too large to be a Colour Archive backup.");
    try {
      const backup = parseBackup(await file.text());
      if (isArchiveEmpty(backup)) throw new Error("This backup is empty. There is nothing to import.");
      setBackupError("");
      setDialog({ type: "import", archive: backup });
    } catch (error) {
      console.error("Could not read the backup file:", error);
      setBackupError(error instanceof Error ? error.message : "The backup file could not be read.");
    }
  }

  async function importBackup(mode: ImportMode) {
    if (dialog?.type !== "import") return;
    const result = await archive.importArchive(dialog.archive, { mode, label: "imported" });
    if (!result) return;
    setDialog(null);
    let message = mode === "replace"
      ? `Archive replaced with ${describeCounts(result.addedMixes, result.addedCollections)} from the backup.`
      : `Imported ${describeCounts(result.addedMixes, result.addedCollections)}.`;
    const other = describeOther(result.addedOther);
    if (other) message += ` Also added ${other}.`;
    if (result.skippedMixes) message += ` ${result.skippedMixes} ${result.skippedMixes === 1 ? "mix was" : "mixes were"} already in your archive.`;
    showNotice(message, 5000);
  }

  async function moveLocalArchive() {
    if (!moveOffer || !userId) return;
    const result = await archive.importArchive(moveOffer, {
      mode: "merge",
      label: "from this browser",
      failureMessage: "Your mixes couldn't be moved to your account. Nothing was removed from this browser.",
    });
    if (!result) return;
    try { clearLocalArchive(); } catch (error) { console.error("Could not clear the browser archive after moving it:", error); }
    setMoveAnsweredFor(userId);
    showNotice(`Moved ${describeCounts(result.addedMixes, result.addedCollections)} to your account.`, 5000);
  }

  function keepLocalArchive() {
    try { if (userId) localStorage.setItem(MOVE_DISMISSED_KEY, userId); } catch { /* storage unavailable */ }
    setMoveAnsweredFor(userId ?? null);
  }

  // ---------- Sharing ----------
  function share(target: ShareTarget) {
    setShareError("");
    setDialog({ type: "share", target });
  }

  const signedIn = Boolean(auth.user);
  const createShareLink = useCallback(async ({ kind, title, mixes }: ShareTarget): Promise<ShareLinkResult> => {
    const recipes = mixes.map(({ name, color, notes, image, paints }) => ({ name, color, notes, image, paints }));
    const payload = kind === "mix"
      ? { version: 1 as const, kind: "mix" as const, mix: recipes[0] }
      : { version: 1 as const, kind: "collection" as const, name: title, mixes: recipes };
    if (signedIn) {
      try {
        return await createShortLink(payload);
      } catch (error) {
        console.error("Could not create a short link; using a compressed link instead:", error);
      }
    }
    return createCompressedLink(payload);
  }, [signedIn]);

  async function saveSharedRecipe(): Promise<boolean> {
    if (shared?.status !== "ready") return false;
    const { payload } = shared;
    // Photos in short links live in the public share folder; save embedded copies instead.
    const mixes: Mix[] = await Promise.all(sharedMixes(payload).map(async (mix) => ({
      ...mix,
      image: isSharePhotoUrl(mix.image) ? await imageToDataUrl(mix.image).catch(() => "") : mix.image,
      // Fresh ids every time, so saving the same link twice keeps two copies.
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    })));
    const collections = payload.kind === "collection"
      ? [{ id: crypto.randomUUID(), name: payload.name.trim() || "Shared collection", mixIds: mixes.map((mix) => mix.id), createdAt: new Date().toISOString() }]
      : [];
    const result = await archive.importArchive(completeArchive({ mixes, collections }), {
      mode: "merge",
      label: "shared",
      failureMessage: payload.kind === "mix" ? "This mix could not be saved. Your browser storage may be full." : "This collection could not be saved. Your browser storage may be full.",
    });
    if (!result) return false;
    const where = archive.kind === "cloud" ? "account" : "archive";
    // The shared page stays open after saving, so this notice stays on screen.
    showNotice(payload.kind === "mix" ? `Mix saved to your ${where}.` : `Collection saved to your ${where}.`, 0);
    return true;
  }

  // ---------- Account ----------
  async function signOut() {
    try {
      await auth.signOut();
      navigate("/");
      showNotice("Signed out. You're now seeing the archive saved in this browser.", 4000);
    } catch (error) {
      console.error("Could not sign out:", error);
      archive.setError("You couldn't be signed out. Check your connection and try again.");
    }
  }

  const accountBanner = useMemo(() => [archive.error, shareError, backupError, auth.linkError], [archive.error, shareError, backupError, auth.linkError]);

  if (shared) return <SharedPage state={shared} notice={notice} error={archive.error} onSave={saveSharedRecipe} />;

  const busy = archive.busy;
  const dialogError = archive.kind === "cloud" ? archive.error : "";

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "desktop-sidebar-collapsed"}`}>
      <Sidebar
        collections={archive.collections}
        mixes={archive.mixes}
        selectedCollectionId={selectedCollection?.id ?? null}
        shoppingCount={shoppingCount}
        expanded={collectionsExpanded}
        onToggleExpanded={() => setCollectionsExpanded((expanded) => !expanded)}
        onNavigate={closeDrawerOnNarrow}
        onAddCollection={() => setDialog({ type: "collection", collection: null })}
        onDeleteCollection={(collection) => setDialog({ type: "deleteCollection", collection })}
      />

      <main className="main-content" id="archive">
        <Topbar
          sectionTitle={sectionTitle}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          canExport={!isArchiveEmpty(archive.archive)}
          onExport={exportBackup}
          onImportFile={chooseBackupFile}
          account={auth.user ? { displayName: auth.displayName, email: auth.user.email || "", syncing: archive.loading || busy, onProfile } : null}
          accountsEnabled={auth.enabled}
          onSignIn={() => setDialog({ type: "signIn" })}
          theme={theme.choice}
          onCycleTheme={theme.cycle}
        />

        <section className="page-content">
          <Routes>
            {["/", "/collections/:collectionId"].map((path) => (
              <Route
                key={path}
                path={path}
                element={(
                  <ArchivePage
                    key={selectedCollection?.id ?? "all"}
                    mixes={archive.mixes}
                    collection={selectedCollection}
                    shelf={shelf}
                    loading={archive.loading}
                    loadFailed={archive.loadFailed}
                    errors={accountBanner}
                    notice={notice}
                    onRetry={archive.reload}
                    onNewMix={() => openMixForm(null)}
                    onEditMix={openMixForm}
                    onViewMix={viewMix}
                    onDeleteMix={deleteMix}
                    onDeleteMixes={deleteMixes}
                    busy={busy}
                    onShareMix={(mix) => share({ kind: "mix", title: mix.name, mixes: [mix] })}
                    onToggleFavorite={toggleFavorite}
                    onMatchColor={() => setDialog({ type: "match" })}
                    onShareCollection={(collection, mixes) => share({ kind: "collection", title: collection.name, mixes })}
                    onManageCollection={() => setDialog({ type: "collection", collection: selectedCollection })}
                  />
                )}
              />
            ))}
            <Route path="/recipes" element={<RecipesPage archive={archive} shelf={shelf} errors={accountBanner} notice={notice} showNotice={showNotice} onViewMix={viewMix} />} />
            <Route path="/projects" element={<ProjectsPage archive={archive} errors={accountBanner} notice={notice} showNotice={showNotice} />} />
            <Route path="/projects/:projectId" element={<ProjectPage archive={archive} shelf={shelf} errors={accountBanner} notice={notice} showNotice={showNotice} onViewMix={viewMix} />} />
            <Route path="/paints" element={<PaintsPage key="shelf" tab="shelf" archive={archive} errors={accountBanner} notice={notice} showNotice={showNotice} />} />
            <Route path="/paints/shopping" element={<PaintsPage key="shopping" tab="shopping" archive={archive} errors={accountBanner} notice={notice} showNotice={showNotice} />} />
            <Route
              path="/profile"
              element={!auth.ready ? null : auth.user ? (
                <ProfilePage
                  user={auth.user}
                  displayName={auth.displayName}
                  mixes={archive.mixes}
                  collections={archive.collections}
                  onUpdateUser={auth.updateUser}
                  onExport={exportBackup}
                  onSignOut={signOut}
                  onViewMix={viewMix}
                />
              ) : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to={{ pathname: "/", hash: location.hash }} replace />} />
          </Routes>

          <footer className="page-footer"><span>Made for the love of making.</span><span>THE COLOUR ARCHIVE <i>·</i> KEEP MIXING</span></footer>
        </section>
      </main>

      {dialog?.type === "mix" && (
        <MixForm mix={dialog.mix} ownedPaints={archive.paints} busy={busy} saveError={dialogError} onSave={saveMix} onClose={() => { if (!busy) closeDialog(); }} />
      )}
      {dialog?.type === "match" && (
        <MatchDialog mixes={archive.mixes} onOpenMix={viewMix} onClose={closeDialog} />
      )}
      {dialog?.type === "collection" && (
        <CollectionForm
          mixes={archive.mixes}
          collections={archive.collections}
          collection={dialog.collection}
          busy={busy}
          saveError={dialogError}
          onSave={saveCollection}
          onClose={() => { if (!busy) closeDialog(); }}
        />
      )}
      {dialog?.type === "deleteCollection" && (
        <ConfirmDialog
          id="delete-collection"
          icon={<Trash2 size={18} />}
          title="Delete this collection?"
          description={<><strong>{dialog.collection.name}</strong> will be removed. Its mixes will remain in your archive.</>}
          onClose={closeDialog}
          actions={(
            <>
              <button autoFocus onClick={closeDialog} disabled={busy}>Cancel</button>
              <button className="confirm-delete" onClick={deleteCollection} disabled={busy}>{busy ? "Deleting…" : "Delete collection"}</button>
            </>
          )}
        >
          {archive.error && <div className="form-error" role="alert">{archive.error}</div>}
        </ConfirmDialog>
      )}
      {dialog?.type === "import" && (
        <ConfirmDialog
          id="import"
          className="import-dialog"
          icon={<Upload size={18} />}
          iconClassName="import-icon"
          title="Import this backup?"
          description={(
            <>
              It contains <strong>{plural(dialog.archive.mixes.length, "mix", "mixes")}</strong> and <strong>{plural(dialog.archive.collections.length, "collection")}</strong>
              {describeOther(dialog.archive) && <>, plus <strong>{describeOther(dialog.archive)}</strong></>}.
              {" "}Add them to your archive, or replace everything {signedIn ? "in your account" : "in this browser"} with the backup.
            </>
          )}
          onClose={closeDialog}
          actionsClassName="import-actions"
          actions={(
            <>
              <button onClick={closeDialog} disabled={busy}>Cancel</button>
              <button className="confirm-delete" onClick={() => importBackup("replace")} disabled={busy}>Replace archive</button>
              <button autoFocus className="confirm-primary" onClick={() => importBackup("merge")} disabled={busy}>{busy ? "Importing…" : "Add to archive"}</button>
            </>
          )}
        >
          {archive.mixes.length > 0 && <p className="import-warning">Replacing deletes your current {plural(archive.mixes.length, "mix", "mixes")}. Export a backup first if you might want them later.</p>}
          {archive.error && <div className="form-error" role="alert">{archive.error}</div>}
        </ConfirmDialog>
      )}
      {moveOffer && !dialog && !auth.recovering && (
        <ConfirmDialog
          id="move"
          className="import-dialog"
          icon={<Upload size={18} />}
          iconClassName="import-icon"
          title="Move this browser’s mixes to your account?"
          description={(
            <>
              This browser has <strong>{plural(moveOffer.mixes.length, "mix", "mixes")}</strong> and <strong>{plural(moveOffer.collections.length, "collection")}</strong> saved before you signed in.
              {" "}Moving them adds them to your account so they appear on every device, then clears them from this browser.
            </>
          )}
          onClose={() => setMoveAnsweredFor(userId ?? null)}
          closeOnBackdrop={false}
          actionsClassName="import-actions"
          actions={(
            <>
              <button onClick={keepLocalArchive} disabled={busy}>Keep them here</button>
              <button autoFocus className="confirm-primary" onClick={moveLocalArchive} disabled={busy}>{busy ? "Moving…" : "Move to my account"}</button>
            </>
          )}
        >
          {archive.error && <div className="form-error" role="alert">{archive.error}</div>}
        </ConfirmDialog>
      )}
      {dialog?.type === "share" && (
        <ShareDialog
          target={dialog.target}
          signedIn={signedIn}
          onCreate={createShareLink}
          onSignIn={() => setDialog({ type: "signIn" })}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "signIn" && <SignInDialog onClose={closeDialog} />}
      {viewingMix && (
        <MixDetail
          mix={viewingMix}
          shelf={shelf}
          collections={archive.collections}
          recipes={archive.recipes}
          projects={archive.projects}
          busy={busy}
          onToggleFavorite={toggleFavorite}
          // Editing or sharing replaces whatever was open underneath, such as Match a colour.
          onEdit={(mix) => { setViewingMixId(null); openMixForm(mix); }}
          onShare={(mix) => { setViewingMixId(null); share({ kind: "mix", title: mix.name, mixes: [mix] }); }}
          onClose={() => setViewingMixId(null)}
        />
      )}
      {auth.recovering && (
        // A password-reset email signed someone in: ask for the new password.
        <SetPasswordDialog
          onClose={auth.endRecovery}
          onSave={async (password) => {
            await auth.updateUser({ password });
            auth.endRecovery();
            showNotice("Your new password is saved. Use it next time you sign in.", 5000);
          }}
        />
      )}
    </div>
  );
}
