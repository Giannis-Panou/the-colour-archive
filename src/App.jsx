import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownUp,
  Beaker,
  Check,
  ChevronDown,
  Download,
  Folder,
  FolderPlus,
  ImagePlus,
  Layers3,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const STORAGE_KEY = "the-colour-archive-mixes";
const COLLECTIONS_STORAGE_KEY = "the-colour-archive-collections";
const RECOVERY_STORAGE_KEY = "the-colour-archive-mixes-recovery";
const MAX_SHARE_URL_LENGTH = 16000;
const BACKUP_APP_ID = "the-colour-archive";
const BACKUP_VERSION = 1;
const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024;

// The recipe fields every mix needs, whether it comes from storage, a share link or a backup.
function isValidMix(mix) {
  return Boolean(
    mix &&
    typeof mix.name === "string" &&
    typeof mix.color === "string" &&
    /^#[\da-f]{6}$/i.test(mix.color) &&
    typeof mix.notes === "string" &&
    Array.isArray(mix.paints) &&
    mix.paints.every((paint) =>
      paint &&
      typeof paint.name === "string" &&
      typeof paint.brand === "string" &&
      typeof paint.drops === "string" &&
      typeof paint.swatch === "string",
    ) &&
    (mix.image === "" || (typeof mix.image === "string" && /^data:image\/(?:jpeg|png|webp);base64,[\da-z+/=]+$/i.test(mix.image))),
  );
}

// A mix saved in an archive also carries its identity and creation date.
function isStoredMix(mix) {
  return isValidMix(mix) &&
    typeof mix.id === "string" &&
    mix.id !== "" &&
    typeof mix.createdAt === "string" &&
    !Number.isNaN(new Date(mix.createdAt).getTime());
}

function isValidCollection(collection) {
  return Boolean(
    collection &&
    typeof collection.id === "string" &&
    typeof collection.name === "string" &&
    Array.isArray(collection.mixIds) &&
    collection.mixIds.every((id) => typeof id === "string"),
  );
}

function uniqueCollectionName(baseName, label, collections) {
  const taken = (name) => collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase());
  let name = `${baseName} (${label})`;
  let suffix = 2;
  while (taken(name)) {
    name = `${baseName} (${label} ${suffix})`;
    suffix += 1;
  }
  return name;
}

function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn’t a Colour Archive backup. It could not be read as JSON.");
  }
  if (data?.app !== BACKUP_APP_ID || !Array.isArray(data.mixes) || !Array.isArray(data.collections)) {
    throw new Error("This file isn’t a Colour Archive backup.");
  }
  if (data.version !== BACKUP_VERSION) {
    throw new Error("This backup was made by a different version of The Colour Archive and can’t be imported.");
  }
  const badMixes = data.mixes.filter((mix) => !isStoredMix(mix)).length;
  if (badMixes) {
    throw new Error(`This backup has ${badMixes} damaged ${badMixes === 1 ? "mix" : "mixes"}, so nothing was imported.`);
  }
  if (!data.collections.every(isValidCollection)) {
    throw new Error("This backup has damaged collection data, so nothing was imported.");
  }
  if (new Set(data.mixes.map((mix) => mix.id)).size !== data.mixes.length) {
    throw new Error("This backup lists the same mix more than once, so nothing was imported.");
  }
  return { mixes: data.mixes, collections: data.collections };
}

function decodeSharedLink() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("share");
  if (!token) return null;

  try {
    const payload = JSON.parse(token);
    if (payload?.version !== 1 || !["mix", "collection"].includes(payload.kind)) {
      throw new Error("The shared link is not in a supported format.");
    }
    if (payload.kind === "mix" && isValidMix(payload.mix)) return payload;
    if (
      payload.kind === "collection" &&
      typeof payload.name === "string" &&
      Array.isArray(payload.mixes) &&
      payload.mixes.every(isValidMix)
    ) return payload;
    throw new Error("The shared link contains invalid mix data.");
  } catch (error) {
    console.error("Could not read the shared colour link:", error);
    return { error: "This shared link is invalid or could not be opened." };
  }
}

function encodeSharedLink(payload) {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `${window.location.origin}${window.location.pathname}#share=${encoded}`;
}

function readMixes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { mixes: [], error: "" };
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved mixes are not in the expected format.");
    const mixes = parsed.filter(isStoredMix);
    if (mixes.length === parsed.length) return { mixes, error: "" };

    // Keep the untouched original so the next save can't erase the damaged entries for good.
    console.error(`Skipped ${parsed.length - mixes.length} damaged saved mix(es).`);
    try {
      if (localStorage.getItem(RECOVERY_STORAGE_KEY) === null) localStorage.setItem(RECOVERY_STORAGE_KEY, stored);
    } catch (recoveryError) {
      console.error("Could not keep a recovery copy of the saved mixes:", recoveryError);
    }
    const skipped = parsed.length - mixes.length;
    return {
      mixes,
      error: `${skipped} saved ${skipped === 1 ? "mix was" : "mixes were"} damaged and could not be shown. The rest of your archive is safe.`,
    };
  } catch (error) {
    console.error("Could not load saved colour mixes:", error);
    return {
      mixes: [],
      error: "Your saved mixes could not be loaded. Check your browser storage settings and refresh.",
    };
  }
}

function readCollections() {
  try {
    const stored = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (!stored) return { collections: [], error: "" };
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved collections are not in the expected format.");
    return { collections: parsed.filter(isValidCollection), error: "" };
  } catch (error) {
    console.error("Could not load saved collections:", error);
    return {
      collections: [],
      error: "Your collections could not be loaded. Check your browser storage settings and refresh.",
    };
  }
}

function App() {
  const initialData = useMemo(() => readMixes(), []);
  const initialCollections = useMemo(() => readCollections(), []);
  const [mixes, setMixes] = useState(initialData.mixes);
  const [collections, setCollections] = useState(initialCollections.collections);
  const [storageError, setStorageError] = useState(initialData.error || initialCollections.error);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [mixToEdit, setMixToEdit] = useState(null);
  const [sharedLink, setSharedLink] = useState(decodeSharedLink);
  const [shareError, setShareError] = useState("");
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState(null);
  const [collectionsExpanded, setCollectionsExpanded] = useState(
    () => !window.matchMedia("(max-width: 899px)").matches,
  );
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(
    () => window.matchMedia("(min-width: 600px)").matches,
  );
  const [selectedCollectionId, setSelectedCollectionId] = useState(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [notice, setNotice] = useState("");
  const [backupError, setBackupError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const noticeTimer = useRef(null);
  const backupInput = useRef(null);
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) || null;

  useEffect(() => {
    function updateSharedLink() {
      setSharedLink(decodeSharedLink());
    }
    window.addEventListener("hashchange", updateSharedLink);
    return () => window.removeEventListener("hashchange", updateSharedLink);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    if (!showForm && !showCollectionForm && !collectionToDelete && !pendingImport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event) {
      if (event.key !== "Escape") return;
      if (pendingImport) setPendingImport(null);
      else if (collectionToDelete) setCollectionToDelete(null);
      else if (showCollectionForm) setShowCollectionForm(false);
      else closeMixForm();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showForm, showCollectionForm, collectionToDelete, pendingImport]);

  // One timer for all notices, so a new notice is never cleared by an older notice's timeout.
  function showNotice(message, duration = 3000) {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    if (duration) noticeTimer.current = window.setTimeout(() => setNotice(""), duration);
  }

  const filteredMixes = useMemo(() => {
    const search = query.trim().toLowerCase();
    const visibleMixes = selectedCollection
      ? mixes.filter((mix) => selectedCollection.mixIds.includes(mix.id))
      : mixes;
    return visibleMixes
      .filter((mix) => {
        const searchable = [
          mix.name,
          mix.notes,
          ...mix.paints.map((paint) => `${paint.name} ${paint.brand}`),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(search);
      })
      .sort((a, b) =>
        sortNewest
          ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          : a.name.localeCompare(b.name),
      );
  }, [mixes, query, selectedCollection, sortNewest]);

  function persist(nextMixes) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMixes));
      setMixes(nextMixes);
      setStorageError("");
      return true;
    } catch (error) {
      console.error("Could not save colour mixes:", error);
      setStorageError("This mix could not be saved. Your browser storage may be full.");
      return false;
    }
  }

  function persistCollections(nextCollections) {
    try {
      localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(nextCollections));
      setCollections(nextCollections);
      setStorageError("");
      return true;
    } catch (error) {
      console.error("Could not save collections:", error);
      setStorageError("This collection could not be saved. Your browser storage may be full.");
      return false;
    }
  }

  // Saves mixes and collections together. If either write fails, both are rolled back.
  function persistArchive(nextMixes, nextCollections, failureMessage) {
    const previousMixes = localStorage.getItem(STORAGE_KEY);
    const previousCollections = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMixes));
      localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(nextCollections));
      setMixes(nextMixes);
      setCollections(nextCollections);
      setStorageError("");
      return true;
    } catch (error) {
      try {
        if (previousMixes === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, previousMixes);
        if (previousCollections === null) localStorage.removeItem(COLLECTIONS_STORAGE_KEY);
        else localStorage.setItem(COLLECTIONS_STORAGE_KEY, previousCollections);
      } catch (rollbackError) {
        console.error("Could not roll back a failed archive save:", rollbackError);
      }
      console.error("Could not save the archive:", error);
      setStorageError(failureMessage);
      return false;
    }
  }

  function exportBackup() {
    try {
      const backup = {
        app: BACKUP_APP_ID,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        mixes,
        collections,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((part) => String(part).padStart(2, "0"))
        .join("-");
      const link = document.createElement("a");
      link.href = url;
      link.download = `colour-archive-${stamp}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupError("");
      showNotice(`Backup downloaded with ${mixes.length} ${mixes.length === 1 ? "mix" : "mixes"} and ${collections.length} ${collections.length === 1 ? "collection" : "collections"}.`, 4000);
    } catch (error) {
      console.error("Could not export the archive:", error);
      setBackupError("The backup could not be created. Please try again.");
    }
  }

  async function chooseBackupFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      setBackupError("This file is too large to be a Colour Archive backup.");
      return;
    }
    try {
      const backup = parseBackup(await file.text());
      if (!backup.mixes.length && !backup.collections.length) {
        throw new Error("This backup is empty. There is nothing to import.");
      }
      setBackupError("");
      setPendingImport(backup);
    } catch (error) {
      console.error("Could not read the backup file:", error);
      setBackupError(error.message || "The backup file could not be read.");
    }
  }

  function importBackup(mode) {
    if (!pendingImport) return;
    let nextMixes;
    let nextCollections;
    let message;

    if (mode === "replace") {
      nextMixes = pendingImport.mixes;
      nextCollections = pendingImport.collections.map((collection) => ({
        ...collection,
        mixIds: collection.mixIds.filter((id) => nextMixes.some((mix) => mix.id === id)),
      }));
      message = `Archive replaced with ${nextMixes.length} ${nextMixes.length === 1 ? "mix" : "mixes"} and ${nextCollections.length} ${nextCollections.length === 1 ? "collection" : "collections"} from the backup.`;
    } else {
      const existingMixIds = new Set(mixes.map((mix) => mix.id));
      const newMixes = pendingImport.mixes.filter((mix) => !existingMixIds.has(mix.id));
      nextMixes = [...newMixes, ...mixes];
      const existingCollectionIds = new Set(collections.map((collection) => collection.id));
      nextCollections = [...collections];
      for (const collection of pendingImport.collections) {
        if (existingCollectionIds.has(collection.id)) continue;
        const nameTaken = nextCollections.some((saved) => saved.name.toLowerCase() === collection.name.toLowerCase());
        nextCollections.push({
          ...collection,
          name: nameTaken ? uniqueCollectionName(collection.name, "imported", nextCollections) : collection.name,
          mixIds: collection.mixIds.filter((id) => nextMixes.some((mix) => mix.id === id)),
        });
      }
      const addedCollections = nextCollections.length - collections.length;
      const skipped = pendingImport.mixes.length - newMixes.length;
      message = `Imported ${newMixes.length} ${newMixes.length === 1 ? "mix" : "mixes"} and ${addedCollections} ${addedCollections === 1 ? "collection" : "collections"}.`;
      if (skipped) message += ` ${skipped} ${skipped === 1 ? "mix was" : "mixes were"} already in your archive.`;
    }

    if (persistArchive(nextMixes, nextCollections, "The backup could not be imported. Your browser storage may be full, so your archive was left unchanged.")) {
      if (selectedCollectionId && !nextCollections.some((collection) => collection.id === selectedCollectionId)) {
        setSelectedCollectionId(null);
      }
      setQuery("");
      setPendingImport(null);
      showNotice(message, 5000);
    }
  }

  function saveCollection(values) {
    const collectionId = values.id || crypto.randomUUID();
    const nextCollections = values.id
      ? collections.map((collection) => collection.id === values.id
        ? { ...collection, name: values.name, mixIds: values.mixIds }
        : collection)
      : [...collections, {
        id: collectionId,
        name: values.name,
        mixIds: values.mixIds,
        createdAt: new Date().toISOString(),
      }];
    if (persistCollections(nextCollections)) {
      setSelectedCollectionId(collectionId);
      setCollectionsExpanded(!window.matchMedia("(max-width: 899px)").matches);
      setShowCollectionForm(false);
      setQuery("");
      showNotice(values.id ? "Collection updated." : "Collection created.");
    }
  }

  function deleteCollection() {
    if (!collectionToDelete) return;
    const nextCollections = collections.filter((collection) => collection.id !== collectionToDelete.id);
    if (persistCollections(nextCollections)) {
      if (selectedCollectionId === collectionToDelete.id) {
        setSelectedCollectionId(null);
        setQuery("");
      }
      setCollectionToDelete(null);
      showNotice(`“${collectionToDelete.name}” was deleted. Its mixes are still in your archive.`);
    }
  }

  function saveMix(formValues) {
    const nextMixes = mixToEdit
      ? mixes.map((mix) => mix.id === mixToEdit.id ? { ...mix, ...formValues } : mix)
      : [{
        ...formValues,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }, ...mixes];
    if (persist(nextMixes)) {
      setShowForm(false);
      showNotice(mixToEdit ? "Mix updated." : "Mix saved to your archive.");
      setMixToEdit(null);
    }
  }

  function closeMixForm() {
    setShowForm(false);
    setMixToEdit(null);
  }

  function editMix(mix) {
    setMixToEdit(mix);
    setShowForm(true);
  }

  function shareLink(kind, data, title) {
    try {
      let payload = kind === "mix"
        ? { version: 1, kind, mix: data }
        : { version: 1, kind, name: data.name, mixes: data.mixes };
      let url = encodeSharedLink(payload);
      let photosOmitted = false;
      if (url.length > MAX_SHARE_URL_LENGTH) {
        payload = kind === "mix"
          ? { ...payload, mix: { ...payload.mix, image: "" } }
          : { ...payload, mixes: payload.mixes.map((mix) => ({ ...mix, image: "" })) };
        url = encodeSharedLink(payload);
        photosOmitted = true;
      }
      if (url.length > MAX_SHARE_URL_LENGTH) {
        throw new Error("This share link is too large. Try sharing fewer mixes or share them individually.");
      }

      setShareError("");
      const onSuccess = (copied) => {
        showNotice(`${photosOmitted ? "Link shared; photos were omitted to keep it short." : "Share link ready."}${copied ? " Copied to clipboard." : ""}`, 4000);
      };
      const onError = (error) => {
        if (error.name === "AbortError") return;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(url).then(
            () => onSuccess(true),
            (clipboardError) => {
              console.error("Could not copy the share link:", clipboardError);
              setShareError("Could not share or copy the link. Check your browser permissions and try again.");
            },
          );
        } else {
          console.error("Could not share colour mix:", error);
          setShareError("Sharing is not available in this browser.");
        }
      };

      if (navigator.share) {
        navigator.share({ title, text: title, url }).then(() => onSuccess(false), onError);
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => onSuccess(true), onError);
      } else {
        throw new Error("Sharing is not available in this browser.");
      }
    } catch (error) {
      console.error("Could not share colour mix:", error);
      setShareError(error.message || "Could not create a share link.");
    }
  }

  function saveSharedLink() {
    if (!sharedLink || sharedLink.error) return false;
    const sharedMixes = sharedLink.kind === "mix" ? [sharedLink.mix] : sharedLink.mixes;
    const importedMixes = sharedMixes.map((mix) => ({
      ...mix,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }));
    const nextMixes = [...importedMixes, ...mixes];

    if (sharedLink.kind === "mix") {
      if (!persist(nextMixes)) return false;
    } else {
      const baseName = sharedLink.name.trim() || "Shared collection";
      const nextCollections = [...collections, {
        id: crypto.randomUUID(),
        name: uniqueCollectionName(baseName, "shared", collections),
        mixIds: importedMixes.map((mix) => mix.id),
        createdAt: new Date().toISOString(),
      }];
      if (!persistArchive(nextMixes, nextCollections, "This collection could not be saved. Your browser storage may be full.")) {
        return false;
      }
    }

    // The shared page stays open after saving, so this notice is kept on screen.
    showNotice(sharedLink.kind === "mix" ? "Mix saved to your archive." : "Collection saved to your archive.", 0);
    return true;
  }

  function deleteMix(id) {
    const nextMixes = mixes.filter((mix) => mix.id !== id);
    const nextCollections = collections.map((collection) => ({
      ...collection,
      mixIds: collection.mixIds.filter((mixId) => mixId !== id),
    }));
    if (persistArchive(nextMixes, nextCollections, "This mix could not be removed. Your browser storage may be full.")) {
      showNotice("Mix removed from your archive.");
    }
  }

  function selectArchive() {
    setSelectedCollectionId(null);
    setQuery("");
    if (window.matchMedia("(max-width: 899px)").matches) setCollectionsExpanded(false);
  }

  function selectCollection(id) {
    setSelectedCollectionId(id);
    setQuery("");
    if (window.matchMedia("(max-width: 899px)").matches) setCollectionsExpanded(false);
  }

  const pageTitle = selectedCollection?.name || "My archive";

  if (sharedLink) return <SharedPage payload={sharedLink} onSave={saveSharedLink} notice={notice} storageError={storageError} />;

  return (
    <div className={`app-shell min-h-screen ${desktopSidebarOpen ? "" : "desktop-sidebar-collapsed"}`}>
      <aside className={`sidebar ${collectionsExpanded ? "collections-open" : ""}`}>
        <a className="brand" href="#" aria-label="The Colour Archive home">
          <span className="brand-mark"><Layers3 size={21} strokeWidth={2.2} /></span>
          <span className="brand-name">the colour<br />archive</span>
        </a>

        <div className="collections-section">
          <div className="collections-desktop-label">COLLECTIONS</div>
          <button
            className="collections-toggle"
            aria-label="Toggle collections"
            aria-expanded={collectionsExpanded}
            title="Toggle collections"
            onClick={() => setCollectionsExpanded((expanded) => !expanded)}
          >
            <FolderPlus size={17} className="collections-toggle-icon" />
            <span className="collections-label-desktop">COLLECTIONS</span>
            <span className="collections-label-mobile">Collections</span>
            <ChevronDown size={15} className={collectionsExpanded ? "collections-chevron expanded" : "collections-chevron"} />
          </button>
          <nav className="side-nav" aria-label="Collections">
            {collections.map((collection) => (
              <div className={`collection-nav-row ${selectedCollectionId === collection.id ? "active" : ""}`} key={collection.id}>
                <button
                  className={`nav-item collection-nav-item ${selectedCollectionId === collection.id ? "active" : ""}`}
                  onClick={() => selectCollection(collection.id)}
                  title={collection.name}
                >
                  <Folder size={17} />
                  <span>{collection.name}</span>
                  <span className="nav-count">{collection.mixIds.filter((id) => mixes.some((mix) => mix.id === id)).length}</span>
                </button>
                <button
                  className="collection-delete-button"
                  aria-label={`Delete collection ${collection.name}`}
                  title={`Delete collection ${collection.name}`}
                  onClick={() => setCollectionToDelete(collection)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button className="add-collection-nav" onClick={() => setShowCollectionForm(true)}>
              <FolderPlus size={16} />
              <span>Add collection</span>
            </button>
          </nav>
        </div>

      </aside>

      <main className="main-content" id="archive">
        <header className="topbar">
          <button
            className="desktop-sidebar-toggle"
            aria-label={desktopSidebarOpen ? "Collapse collections sidebar" : "Expand collections sidebar"}
            title={desktopSidebarOpen ? "Collapse collections sidebar" : "Expand collections sidebar"}
            onClick={() => setDesktopSidebarOpen((open) => !open)}
          >
            {desktopSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="breadcrumb">
            {selectedCollection && (
              <>
                <button className="breadcrumb-home" onClick={selectArchive}>My archive</button>
                <span className="crumb-slash">/</span>
              </>
            )}
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <div className="backup-actions" role="group" aria-label="Backup">
              <button
                className="backup-button"
                onClick={exportBackup}
                disabled={!mixes.length && !collections.length}
                aria-label="Export backup"
                title="Download a backup file of your archive"
              >
                <Download size={15} /><span>Export</span>
              </button>
              <button
                className="backup-button"
                onClick={() => backupInput.current?.click()}
                aria-label="Import backup"
                title="Load mixes from a backup file"
              >
                <Upload size={15} /><span>Import</span>
              </button>
              <input
                ref={backupInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={chooseBackupFile}
              />
            </div>
            <span className="topbar-divider" />
            <span className="saved-status"><span className="status-dot" /> Saved in this browser</span>
            <span className="topbar-divider" />
            <span className="date-label">YOUR PAINT DESK</span>
          </div>
        </header>

        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL PAINT LIBRARY</div>
              <h1>{pageTitle}<span className="heading-period">.</span></h1>
              <p className="heading-subtitle">{selectedCollection ? `A hand-picked collection of ${filteredMixes.length} ${filteredMixes.length === 1 ? "mix" : "mixes"}.` : "Every good colour has a story. Keep yours."}</p>
            </div>
            <button className="primary-button" onClick={() => setShowForm(true)}>
              <Plus size={18} strokeWidth={2.4} /> New colour mix
            </button>
          </div>

          <section className="summary-row" aria-label="Archive summary">
            <div className="summary-card">
              <span className="summary-icon archive-icon"><Archive size={18} /></span>
              <span className="summary-copy"><span className="summary-label">IN YOUR ARCHIVE</span><strong>{mixes.length} <small>{mixes.length === 1 ? "mix" : "mixes"}</small></strong></span>
              <span className="summary-decoration">01</span>
            </div>
            <div className="summary-card">
              <span className="summary-icon paint-icon"><Beaker size={18} /></span>
              <span className="summary-copy"><span className="summary-label">PAINTS USED</span><strong>{new Set(mixes.flatMap((mix) => mix.paints.map((paint) => `${paint.brand}:${paint.name}`))).size} <small>unique paints</small></strong></span>
              <span className="summary-decoration">02</span>
            </div>
            <div className="summary-card palette-summary">
              <div className="palette-swatches" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <span className="summary-copy"><span className="summary-label">YOUR PALETTE</span><strong><small>A collection in the making</small></strong></span>
              <span className="summary-decoration">03</span>
            </div>
          </section>

          <section className="collection-section">
            <div className="section-title-row">
              <div>
                <h2>{selectedCollection ? "Collection mixes" : "Your colour mixes"} <span className="mix-total">{selectedCollection ? mixes.filter((mix) => selectedCollection.mixIds.includes(mix.id)).length : mixes.length}</span></h2>
                <p>{selectedCollection ? `Mixes saved in ${selectedCollection.name}.` : "Recipes worth remembering."}</p>
              </div>
              {selectedCollection ? (
                <div className="collection-controls">
                  <button className="sort-button" onClick={() => shareLink("collection", {
                    name: selectedCollection.name,
                    mixes: mixes.filter((mix) => selectedCollection.mixIds.includes(mix.id)),
                  }, selectedCollection.name)}>
                    <Share2 size={15} /> Share collection
                  </button>
                  <button className="sort-button" onClick={() => setShowCollectionForm(true)}>
                    <Plus size={15} /> Manage mixes
                  </button>
                  {filteredMixes.length > 0 && <button className="sort-button" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={15} /> {sortNewest ? "Newest first" : "Name A–Z"}</button>}
                </div>
              ) : mixes.length > 0 && (
                <div className="collection-controls">
                  <label className="search-box">
                    <Search size={16} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mixes..." aria-label="Search mixes" />
                    {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
                  </label>
                  <button className="sort-button" onClick={() => setSortNewest((value) => !value)}>
                    <ArrowDownUp size={15} /> {sortNewest ? "Newest first" : "Name A–Z"}
                  </button>
                </div>
              )}
            </div>

            {storageError && <div className="error-banner" role="alert">{storageError}</div>}
            {shareError && <div className="error-banner" role="alert">{shareError}</div>}
            {backupError && <div className="error-banner" role="alert">{backupError}</div>}
            {notice && <div className="success-banner" role="status"><Check size={16} />{notice}</div>}

            {filteredMixes.length > 0 ? (
              <div className="mix-grid">
                {filteredMixes.map((mix) => (
                  <MixCard
                    key={mix.id}
                    mix={mix}
                    onDelete={deleteMix}
                    onEdit={editMix}
                    onShare={() => shareLink("mix", mix, mix.name)}
                  />
                ))}
              </div>
            ) : selectedCollection && !query.trim() ? (
              <div className="empty-search collection-empty">
                <Folder size={23} />
                <h3>This collection is ready for its first mix</h3>
                <p>Add mixes from your archive. They’ll stay in your archive too.</p>
                <button className="primary-button" onClick={() => setShowCollectionForm(true)}><Plus size={16} /> Add mixes</button>
              </div>
            ) : selectedCollection || mixes.length > 0 ? (
              <div className="empty-search">
                <Search size={22} />
                <h3>No mixes found</h3>
                <p>Try a different colour, paint, or brand name.</p>
                <button className="text-button" onClick={() => setQuery("")}>Clear search</button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-art">
                  <div className="art-paper"><span className="art-drop drop-one" /><span className="art-drop drop-two" /><span className="art-drop drop-three" /><span className="art-brush" /></div>
                  <span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✳</span>
                </div>
                <div className="empty-copy">
                  <span className="empty-kicker">A FRESH PAGE</span>
                  <h3>Your next favourite<br />colour starts here.</h3>
                  <p>Mix a colour you love? Save the paints, drop counts, and a photo so you can recreate it whenever inspiration strikes.</p>
                  <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={17} /> Log your first mix</button>
                </div>
                <div className="empty-side-note"><span>01</span><i /> YOUR COLOUR STORY BEGINS</div>
              </div>
            )}
          </section>

          <footer className="page-footer"><span>Made for the love of making.</span><span>THE COLOUR ARCHIVE <i>·</i> KEEP MIXING</span></footer>
        </section>
      </main>

      {showForm && <MixForm mix={mixToEdit} onClose={closeMixForm} onSave={saveMix} />}
      {showCollectionForm && (
        <CollectionForm
          mixes={mixes}
          collections={collections}
          collection={selectedCollection}
          onClose={() => setShowCollectionForm(false)}
          onSave={saveCollection}
        />
      )}
      {collectionToDelete && (
        <div className="modal-backdrop collection-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCollectionToDelete(null); }}>
          <section className="collection-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-collection-title" aria-describedby="delete-collection-description">
            <span className="confirm-icon"><Trash2 size={18} /></span>
            <h2 id="delete-collection-title">Delete this collection?</h2>
            <p id="delete-collection-description"><strong>{collectionToDelete.name}</strong> will be removed. Its mixes will remain in your archive.</p>
            {storageError && <div className="form-error" role="alert">{storageError}</div>}
            <div className="confirm-actions">
              <button autoFocus onClick={() => setCollectionToDelete(null)}>Cancel</button>
              <button className="confirm-delete" onClick={deleteCollection}>Delete collection</button>
            </div>
          </section>
        </div>
      )}
      {pendingImport && (
        <div className="modal-backdrop collection-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingImport(null); }}>
          <section className="collection-delete-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-description">
            <span className="confirm-icon import-icon"><Upload size={18} /></span>
            <h2 id="import-title">Import this backup?</h2>
            <p id="import-description">
              It contains <strong>{pendingImport.mixes.length} {pendingImport.mixes.length === 1 ? "mix" : "mixes"}</strong> and <strong>{pendingImport.collections.length} {pendingImport.collections.length === 1 ? "collection" : "collections"}</strong>.
              {" "}Add them to your archive, or replace everything in this browser with the backup.
            </p>
            {mixes.length > 0 && <p className="import-warning">Replacing deletes your current {mixes.length} {mixes.length === 1 ? "mix" : "mixes"}. Export a backup first if you might want them later.</p>}
            {storageError && <div className="form-error" role="alert">{storageError}</div>}
            <div className="confirm-actions import-actions">
              <button onClick={() => setPendingImport(null)}>Cancel</button>
              <button className="confirm-delete" onClick={() => importBackup("replace")}>Replace archive</button>
              <button autoFocus className="confirm-primary" onClick={() => importBackup("merge")}>Add to archive</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SharedPage({ payload, onSave, notice, storageError }) {
  const [saved, setSaved] = useState(false);
  const isCollection = payload.kind === "collection";
  const mixes = isCollection ? payload.mixes : payload.mix ? [payload.mix] : [];
  const title = payload.error ? "This share link is unavailable" : isCollection ? payload.name : payload.mix.name;

  return (
    <main className="shared-page">
      <header className="shared-page-header">
        <a className="shared-brand" href={`${window.location.origin}${window.location.pathname}`}>
          <span className="brand-mark"><Layers3 size={21} strokeWidth={2.2} /></span>
          <span className="brand-name">the colour<br />archive</span>
        </a>
        <span className="shared-label">SHARED PAINT RECIPE</span>
      </header>
      <section className="shared-page-content">
        <span className="eyebrow"><span className="eyebrow-line" /> {isCollection ? "A COLLECTION TO EXPLORE" : "A COLOUR MIX TO TRY"}</span>
        <h1>{title}<span className="heading-period">.</span></h1>
        {payload.error ? (
          <p className="shared-intro" role="alert">{payload.error}</p>
        ) : (
          <>
            <p className="shared-intro">A snapshot from The Colour Archive. Save the recipe to your own browser to keep it handy.</p>
            <div className="shared-mix-grid">
              {mixes.map((mix, index) => <SharedMixCard key={`${mix.name}-${index}`} mix={mix} />)}
            </div>
            {!mixes.length && <p className="shared-intro">This collection doesn’t contain any mixes yet.</p>}
            {storageError && <p className="error-banner" role="alert">{storageError}</p>}
            {notice && <p className="success-banner" role="status">{notice}</p>}
            <button
              className="primary-button shared-home-link"
              disabled={saved}
              onClick={() => setSaved(onSave())}
            >
              {saved ? "Saved to my archive" : isCollection ? "Save collection to my archive" : "Save mix to my archive"}
            </button>
          </>
        )}
        <a className="shared-archive-link" href={`${window.location.origin}${window.location.pathname}`}>Open my archive</a>
      </section>
    </main>
  );
}

function SharedMixCard({ mix }) {
  const [showSavedColor, setShowSavedColor] = useState(false);

  return (
    <article className="shared-mix-card">
      <div className="shared-mix-image" style={{ backgroundColor: mix.color }}>
        {mix.image && !showSavedColor
          ? <img src={mix.image} alt={`Photo of ${mix.name}`} />
          : <div className="saved-color-preview" role="img" aria-label={`Saved mix colour ${mix.color.toUpperCase()}`} />}
        {mix.image && (
          <button
            className="image-color-toggle"
            type="button"
            aria-label={showSavedColor ? "Show mix photo" : "Show saved colour"}
            title={showSavedColor ? "Show mix photo" : "Show saved colour"}
            onClick={() => setShowSavedColor((shown) => !shown)}
          >
            {showSavedColor ? <ImageIcon size={14} /> : <Palette size={14} />}
            <span>{showSavedColor ? "Show photo" : "Saved colour"}</span>
          </button>
        )}
        <span className="color-code">{mix.color.toUpperCase()}</span>
      </div>
      <div className="mix-card-body">
        <div className="mix-card-title-row">
          <h3>{mix.name}</h3>
          <span className="paint-count">{mix.paints.length} {mix.paints.length === 1 ? "paint" : "paints"}</span>
        </div>
        <div className="paint-list">
          {mix.paints.map((paint, index) => (
            <div className="paint-line" key={`${paint.name}-${index}`}>
              <span className="paint-dot" style={{ backgroundColor: paint.swatch }} />
              <span className="paint-name">{paint.name || "Untitled paint"}</span>
              <span className="paint-brand">{paint.brand}</span>
              <strong>{paint.drops} <small>{Number(paint.drops) === 1 ? "drop" : "drops"}</small></strong>
            </div>
          ))}
        </div>
        {mix.notes && <p className="shared-mix-notes">{mix.notes}</p>}
      </div>
    </article>
  );
}

function MixCard({ mix, onDelete, onEdit, onShare }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSavedColor, setShowSavedColor] = useState(false);
  const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(mix.createdAt));
  const totalDrops = mix.paints.reduce((total, paint) => total + Number(paint.drops), 0);

  return (
    <article className="mix-card">
      <div className="mix-image" style={{ backgroundColor: mix.color }}>
        {mix.image && !showSavedColor
          ? <img src={mix.image} alt={`Photo of ${mix.name}`} />
          : <div className="saved-color-preview" role="img" aria-label={`Saved mix colour ${mix.color.toUpperCase()}`} />}
        {mix.image && (
          <button
            className="image-color-toggle"
            type="button"
            aria-label={showSavedColor ? "Show mix photo" : "Show saved colour"}
            title={showSavedColor ? "Show mix photo" : "Show saved colour"}
            onClick={() => setShowSavedColor((shown) => !shown)}
          >
            {showSavedColor ? <ImageIcon size={14} /> : <Palette size={14} />}
            <span>{showSavedColor ? "Show photo" : "Saved colour"}</span>
          </button>
        )}
        <span className="color-code">{mix.color.toUpperCase()}</span>
        <div className="mix-card-actions">
          <button className="share-button" onClick={onShare} aria-label={`Share ${mix.name}`} title={`Share ${mix.name}`}><Share2 size={15} /></button>
          <button className="edit-button" onClick={() => onEdit(mix)} aria-label={`Edit ${mix.name}`} title={`Edit ${mix.name}`}><Pencil size={15} /></button>
          <button className="delete-button" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${mix.name}`} title={`Delete ${mix.name}`}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="mix-card-body">
        <div className="mix-card-title-row">
          <h3>{mix.name}</h3>
          <span className="paint-count">{mix.paints.length} {mix.paints.length === 1 ? "paint" : "paints"}</span>
        </div>
        <div className="paint-list">
          {mix.paints.map((paint, index) => (
            <div className="paint-line" key={`${paint.name}-${index}`}>
              <span className="paint-dot" style={{ backgroundColor: paint.swatch }} />
              <span className="paint-name">{paint.name || "Untitled paint"}</span>
              <span className="paint-brand">{paint.brand}</span>
              <strong>{paint.drops} <small>{Number(paint.drops) === 1 ? "drop" : "drops"}</small></strong>
            </div>
          ))}
        </div>
        <div className="mix-card-footer">
          <span>{mix.notes ? mix.notes : `${totalDrops} ${totalDrops === 1 ? "drop" : "drops"} in this mix`}</span>
          <time>{date}</time>
        </div>
      </div>
      {confirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-box" role="dialog" aria-modal="true" aria-label="Delete mix">
            <span className="confirm-icon"><Trash2 size={18} /></span>
            <h4>Remove this mix?</h4>
            <p>“{mix.name}” will be deleted from your archive.</p>
            <div className="confirm-actions">
              <button onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="confirm-delete" onClick={() => onDelete(mix.id)}>Remove mix</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function CollectionForm({ mixes, collections, collection, onClose, onSave }) {
  const [name, setName] = useState(collection?.name || "");
  const [selectedIds, setSelectedIds] = useState(collection?.mixIds || []);
  const [error, setError] = useState("");

  function toggleMix(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((mixId) => mixId !== id) : [...current, id],
    );
  }

  function submit(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Give your collection a name.");
      return;
    }
    if (collections.some((savedCollection) =>
      savedCollection.id !== collection?.id && savedCollection.name.toLowerCase() === cleanName.toLowerCase(),
    )) {
      setError("A collection with that name already exists.");
      return;
    }
    onSave({
      id: collection?.id,
      name: cleanName,
      mixIds: selectedIds.filter((id) => mixes.some((mix) => mix.id === id)),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="collection-modal" role="dialog" aria-modal="true" aria-labelledby="collection-form-title">
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">{collection ? "ORGANIZE YOUR MIXES" : "MAKE A NEW COLLECTION"}</span>
            <h2 id="collection-form-title">{collection ? "Manage collection" : "Add a collection"}<span>.</span></h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close collection form"><X size={19} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="collection-form-content">
            <label className="field-label">Collection name
              <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Woodland bases" autoFocus maxLength={50} />
            </label>
            <div className="collection-picker-heading">
              <div><strong>Choose mixes</strong><span>Select the recipes to include.</span></div>
              <span>{selectedIds.filter((id) => mixes.some((mix) => mix.id === id)).length} selected</span>
            </div>
            {mixes.length ? (
              <div className="collection-mix-list">
                {mixes.map((mix) => {
                  const checked = selectedIds.includes(mix.id);
                  return (
                    <label className={`collection-mix-option ${checked ? "selected" : ""}`} key={mix.id}>
                      <input type="checkbox" checked={checked} onChange={() => toggleMix(mix.id)} />
                      <span className="collection-mix-swatch" style={{ backgroundColor: mix.color }} />
                      <span className="collection-mix-copy"><strong>{mix.name}</strong><small>{mix.paints.map((paint) => paint.name).filter(Boolean).join(" · ") || "No paints listed"}</small></span>
                      <span className="collection-mix-hex">{mix.color.toUpperCase()}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="collection-no-mixes"><Archive size={20} /><span>Save a colour mix first. You can add it here later.</span></div>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
          </div>
          <div className="modal-footer">
            <span><span className="local-lock">◈</span> Mixes stay in your archive</span>
            <div>
              <button className="cancel-button" type="button" onClick={onClose}>Cancel</button>
              <button className="primary-button save-button" type="submit"><Check size={16} /> {collection ? "Save collection" : "Create collection"}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function MixForm({ mix, onClose, onSave }) {
  const [name, setName] = useState(mix?.name || "");
  const [color, setColor] = useState(mix?.color || "#7187a1");
  const [notes, setNotes] = useState(mix?.notes || "");
  const [image, setImage] = useState(mix?.image || "");
  const [imageName, setImageName] = useState(mix?.image ? "Current photo" : "");
  const [error, setError] = useState("");
  const [paints, setPaints] = useState(mix?.paints.map((paint) => ({ ...paint })) || [{ name: "", brand: "The Army Painter", drops: "1", swatch: "#8593aa" }]);
  const fileInput = useRef(null);
  const previewCanvas = useRef(null);
  const sampleCanvas = useRef(null);
  const magnifierCanvas = useRef(null);
  const dragStart = useRef(null);
  const [selection, setSelection] = useState(null);
  const [magnifier, setMagnifier] = useState(null);
  const [sampleMessage, setSampleMessage] = useState("Drag to target a pixel; release to sample the exact colour under the cursor.");

  useEffect(() => {
    if (!image || !previewCanvas.current || !sampleCanvas.current) return;

    const source = new Image();
    source.onload = () => {
      const preview = previewCanvas.current;
      const sampler = sampleCanvas.current;
      if (!preview || !sampler) return;
      preview.width = source.naturalWidth;
      preview.height = source.naturalHeight;
      sampler.width = source.naturalWidth;
      sampler.height = source.naturalHeight;
      const previewContext = preview.getContext("2d");
      const sampleContext = sampler.getContext("2d", { willReadFrequently: true });
      if (!previewContext || !sampleContext) {
        setError("The photo could not be prepared for colour sampling.");
        return;
      }
      previewContext.drawImage(source, 0, 0);
      sampleContext.drawImage(source, 0, 0);
      setSelection(null);
      setSampleMessage("Drag to target a pixel; release to sample the exact colour under the cursor.");
    };
    source.onerror = () => setError("The photo could not be prepared for colour sampling.");
    source.src = image;

    return () => {
      source.onload = null;
      source.onerror = null;
    };
  }, [image]);

  useEffect(() => {
    const lens = magnifierCanvas.current;
    const source = sampleCanvas.current;
    const context = lens?.getContext("2d");
    if (!magnifier || !lens || !source || !context || !source.width || !source.height) return;

    const sampleSize = Math.min(21, source.width, source.height);
    const pixelX = Math.max(0, Math.min(source.width - 1, Math.floor(magnifier.point.x)));
    const pixelY = Math.max(0, Math.min(source.height - 1, Math.floor(magnifier.point.y)));
    const x = pixelX - Math.floor(sampleSize / 2);
    const y = pixelY - Math.floor(sampleSize / 2);
    lens.width = 126;
    lens.height = 126;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, lens.width, lens.height);
    context.drawImage(source, x, y, sampleSize, sampleSize, 0, 0, lens.width, lens.height);
    context.strokeStyle = "rgba(255,255,255,.32)";
    context.lineWidth = 1;
    for (let gridLine = 1; gridLine < 21; gridLine += 1) {
      const position = gridLine * 6 + 0.5;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, lens.height);
      context.moveTo(0, position);
      context.lineTo(lens.width, position);
      context.stroke();
    }

    try {
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return;
      const pixel = sourceContext.getImageData(pixelX, pixelY, 1, 1).data;
      setMagnifier((current) => {
        if (!current) return current;
        const hex = [pixel[0], pixel[1], pixel[2]]
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("");
        const color = `#${hex}`;
        return current.color === color ? current : { ...current, color };
      });
    } catch (sampleError) {
      console.error("Could not magnify the photo colour:", sampleError);
      setError("The photo pixels could not be magnified.");
    }
  }, [magnifier?.point.x, magnifier?.point.y]);

  function updatePaint(index, key, value) {
    setPaints((current) => current.map((paint, paintIndex) => paintIndex === index ? { ...paint, [key]: value } : paint));
  }

  function addPaint() {
    setPaints((current) => [...current, { name: "", brand: "The Army Painter", drops: "1", swatch: "#ad8064" }]);
  }

  function getImagePoint(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(previewCanvas.current.width, (event.clientX - bounds.left) * previewCanvas.current.width / bounds.width)),
      y: Math.max(0, Math.min(previewCanvas.current.height, (event.clientY - bounds.top) * previewCanvas.current.height / bounds.height)),
    };
  }

  function handleSampleStart(event) {
    if (!sampleCanvas.current?.width) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = getImagePoint(event);
    updateMagnifier(event);
    setSelection({ ...dragStart.current, width: 1, height: 1 });
  }

  function updateMagnifier(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = getImagePoint(event);
    const displayX = event.clientX - bounds.left;
    const displayY = event.clientY - bounds.top;
    const lensWidth = 130;
    setMagnifier({
      point,
      color: magnifier?.color,
      left: Math.max(lensWidth / 2, Math.min(bounds.width - lensWidth / 2, displayX)),
      top: displayY,
      below: displayY < 155,
    });
  }

  function handleSampleMove(event) {
    updateMagnifier(event);
    if (!dragStart.current) return;
    const point = getImagePoint(event);
    setSelection({
      x: Math.min(dragStart.current.x, point.x),
      y: Math.min(dragStart.current.y, point.y),
      width: Math.abs(point.x - dragStart.current.x),
      height: Math.abs(point.y - dragStart.current.y),
    });
  }

  function sampleColor(point) {
    const canvas = sampleCanvas.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || !point) return;

    try {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y)));
      const pixel = context.getImageData(x, y, 1, 1).data;
      if (pixel[3] === 0) {
        setError("No visible colour was found in that part of the photo.");
        return;
      }
      const hex = [pixel[0], pixel[1], pixel[2]]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("");
      const detectedColor = `#${hex}`;
      const bounds = previewCanvas.current?.getBoundingClientRect();
      const markerWidth = bounds ? Math.min(canvas.width, 14 * canvas.width / bounds.width) : 1;
      const markerHeight = bounds ? Math.min(canvas.height, 14 * canvas.height / bounds.height) : 1;
      setColor(detectedColor);
      setSelection({
        x: Math.max(0, Math.min(canvas.width - markerWidth, x + 0.5 - markerWidth / 2)),
        y: Math.max(0, Math.min(canvas.height - markerHeight, y + 0.5 - markerHeight / 2)),
        width: markerWidth,
        height: markerHeight,
      });
      setSampleMessage(`Sampled pixel ${detectedColor.toUpperCase()}.`);
      setError("");
    } catch (sampleError) {
      console.error("Could not sample the photo colour:", sampleError);
      setError("The photo colour could not be detected. Try selecting another area.");
    }
  }

  function handleSampleEnd(event) {
    if (!dragStart.current) return;
    const point = getImagePoint(event);
    dragStart.current = null;
    sampleColor(point);
  }

  function handleSampleLeave() {
    if (!dragStart.current) setMagnifier(null);
  }

  function handleSampleKeyDown(event) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    const canvas = sampleCanvas.current;
    if (!canvas?.width) return;
    const size = Math.min(24, canvas.width, canvas.height);
    const current = selection || {
      x: (canvas.width - size) / 2,
      y: (canvas.height - size) / 2,
      width: size,
      height: size,
    };
    if (event.key === "Enter" || event.key === " ") {
      sampleColor({ x: current.x + current.width / 2, y: current.y + current.height / 2 });
      return;
    }
    const step = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) * 0.02));
    const x = current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0);
    const y = current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
    const next = {
      ...current,
      x: Math.max(0, Math.min(canvas.width - current.width, x)),
      y: Math.max(0, Math.min(canvas.height - current.height, y)),
    };
    setSelection(next);
  }

  function handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file to add a photo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("This photo is larger than 8 MB. Choose a smaller image.");
      event.target.value = "";
      return;
    }
    const sourceReader = new FileReader();
    sourceReader.onload = () => {
      const sourceImage = new Image();
      sourceImage.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(sourceImage.width, sourceImage.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(sourceImage.width * scale);
        canvas.height = Math.round(sourceImage.height * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          setError("The photo could not be processed. Please try another image.");
          return;
        }
        context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            setError("The photo could not be processed. Please try another image.");
            return;
          }
          const compressedReader = new FileReader();
          compressedReader.onload = () => {
            setImage(String(compressedReader.result));
            setImageName(file.name);
            setError("");
          };
          compressedReader.onerror = () => setError("The photo could not be read. Please try another image.");
          compressedReader.readAsDataURL(blob);
        }, "image/jpeg", 0.78);
      };
      sourceImage.onerror = () => setError("The photo could not be read. Please try another image.");
      sourceImage.src = String(sourceReader.result);
    };
    sourceReader.onerror = () => setError("The photo could not be read. Please try another image.");
    sourceReader.readAsDataURL(file);
  }

  function submit(event) {
    event.preventDefault();
    const cleanPaints = paints.filter((paint) => paint.name.trim());
    if (!name.trim()) {
      setError("Give your mix a name before saving.");
      return;
    }
    if (!cleanPaints.length) {
      setError("Add at least one paint to your recipe.");
      return;
    }
    if (cleanPaints.some((paint) => !Number.isInteger(Number(paint.drops)) || Number(paint.drops) < 1)) {
      setError("Each paint needs a whole number of drops (at least 1).");
      return;
    }
    onSave({ name: name.trim(), color, notes: notes.trim(), image, paints: cleanPaints });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mix-modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
        <div className="modal-header">
          <div><span className="modal-eyebrow">{mix ? "UPDATE YOUR ARCHIVE" : "ADD TO YOUR ARCHIVE"}</span><h2 id="form-title">{mix ? "Edit colour mix" : "A new colour mix"}<span>.</span></h2></div>
          <button className="modal-close" onClick={onClose} aria-label="Close form"><X size={19} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-scroll-area">
            <label className="field-label">What are you calling it?<span className="required-mark">*</span>
              <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Stormy midnight blue" autoFocus maxLength={70} />
            </label>

            <div className="field-label color-field-label">The colour you made
              <div className="color-input-wrap">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Choose the mixed colour" />
                <span>{color.toUpperCase()}</span>
                <span className="color-field-hint">Pick the closest match</span>
              </div>
            </div>

            <div className="form-section-heading"><span>THE RECIPE</span><span className="ingredient-hint">Paint &amp; drop count</span></div>
            <div className="ingredients">
              {paints.map((paint, index) => (
                <div className="ingredient-row" key={index}>
                  <span className="ingredient-index">{String(index + 1).padStart(2, "0")}</span>
                  <label className="ingredient-input paint-field"><span className="sr-only">Paint name</span><input value={paint.name} onChange={(event) => updatePaint(index, "name", event.target.value)} placeholder="Paint name" maxLength={50} /></label>
                  <label className="ingredient-input brand-field"><span className="sr-only">Paint brand</span><select value={paint.brand} onChange={(event) => updatePaint(index, "brand", event.target.value)}><option>The Army Painter</option><option>Citadel</option><option>Vallejo</option><option>AK Interactive</option><option>Other</option></select></label>
                  <label className="ingredient-input drops-field"><span className="sr-only">Number of drops</span><input type="number" min="1" step="1" value={paint.drops} onChange={(event) => updatePaint(index, "drops", event.target.value)} /><small>drops</small></label>
                </div>
              ))}
            </div>
            <button className="add-paint-button" type="button" onClick={addPaint}><Plus size={15} /> Add another paint</button>

            <div className="form-lower-grid">
              <label className="field-label">A note for later <span className="optional-label">OPTIONAL</span>
                <textarea className="text-input notes-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What did you use it for? Any tips for next time?" maxLength={240} />
              </label>
              <div className="field-label">A photo of your mix <span className="optional-label">OPTIONAL</span>
                {!image && (
                  <button className="upload-zone" type="button" onClick={() => fileInput.current?.click()}>
                    <span className="upload-icon"><ImagePlus size={18} /></span><span className="upload-copy"><strong>{imageName || "Add a photo"}</strong><small>JPG, PNG or WebP · up to 8 MB, resized</small></span><Plus size={17} className="upload-plus" />
                  </button>
                )}
                <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={handleImage} />
                {image && (
                  <>
                    <div className="color-sampler-frame">
                      <div className="color-sampler">
                        <canvas ref={sampleCanvas} className="sr-only" aria-hidden="true" />
                        <canvas
                          ref={previewCanvas}
                          className="color-sampler-canvas"
                          role="button"
                          tabIndex={0}
                          aria-label="Photo colour sampler. Drag to select an area, or use arrow keys and press Enter."
                          onPointerDown={handleSampleStart}
                          onPointerMove={handleSampleMove}
                          onPointerUp={handleSampleEnd}
                          onPointerCancel={handleSampleEnd}
                          onPointerLeave={handleSampleLeave}
                          onKeyDown={handleSampleKeyDown}
                        />
                        {magnifier && (
                          <div
                            className={`color-magnifier ${magnifier.below ? "below-cursor" : ""}`}
                            style={{ left: `${magnifier.left}px`, top: `${magnifier.top}px` }}
                            aria-hidden="true"
                          >
                            <canvas ref={magnifierCanvas} />
                            <span className="magnifier-color">
                              <i style={{ backgroundColor: magnifier.color || "#fff" }} />
                              {magnifier.color?.toUpperCase() || "PIXEL"}
                            </span>
                          </div>
                        )}
                        {selection && (
                          <span
                            className="color-sampler-selection"
                            style={{
                              left: `${selection.x / previewCanvas.current?.width * 100}%`,
                              top: `${selection.y / previewCanvas.current?.height * 100}%`,
                              width: `${selection.width / previewCanvas.current?.width * 100}%`,
                              height: `${selection.height / previewCanvas.current?.height * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <span className="sampler-help" aria-live="polite">{sampleMessage}</span>
                    <div className="photo-actions">
                      <button type="button" className="remove-photo" onClick={() => fileInput.current?.click()}>Choose another photo</button>
                      <button type="button" className="remove-photo" onClick={() => {
                        setImage("");
                        setImageName("");
                        setSelection(null);
                        if (fileInput.current) fileInput.current.value = "";
                      }}>Remove photo</button>
                    </div>
                  </>
                )}
              </div>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
          </div>
          <div className="modal-footer">
            <span><span className="local-lock">◈</span> Saved privately on this device</span>
            <div><button className="cancel-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button save-button" type="submit"><Check size={16} /> {mix ? "Save changes" : "Save mix"}</button></div>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
