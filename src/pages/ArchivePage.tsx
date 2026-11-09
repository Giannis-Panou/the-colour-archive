import { Archive, ArrowDownUp, Beaker, Check, Folder, LoaderCircle, Plus, Search, Share2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Collection, Mix } from "../types";
import { MixCard } from "../components/mixes/MixCard";

interface ArchivePageProps {
  mixes: Mix[];
  /** The open collection, or null for the whole archive. */
  collection: Collection | null;
  loading: boolean;
  loadFailed: boolean;
  /** Banners shown above the grid. */
  errors: string[];
  notice: string;
  onRetry: () => void;
  onNewMix: () => void;
  onEditMix: (mix: Mix) => void;
  onDeleteMix: (mix: Mix) => void;
  onShareMix: (mix: Mix) => void;
  onShareCollection: (collection: Collection, mixes: Mix[]) => void;
  onManageCollection: () => void;
}

/** "My archive" and a single collection: heading, summary, search, sort and the mix grid. */
export function ArchivePage({
  mixes, collection, loading, loadFailed, errors, notice,
  onRetry, onNewMix, onEditMix, onDeleteMix, onShareMix, onShareCollection, onManageCollection,
}: ArchivePageProps) {
  const [query, setQuery] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const collectionMixes = useMemo(() => (collection ? mixes.filter((mix) => collection.mixIds.includes(mix.id)) : mixes), [mixes, collection]);
  const uniquePaints = useMemo(() => new Set(mixes.flatMap((mix) => mix.paints.map((paint) => `${paint.brand}:${paint.name}`))).size, [mixes]);

  const visibleMixes = useMemo(() => {
    const search = query.trim().toLowerCase();
    return collectionMixes
      .filter((mix) => [mix.name, mix.notes, ...mix.paints.map((paint) => `${paint.name} ${paint.brand}`)].join(" ").toLowerCase().includes(search))
      .sort((a, b) => (sortNewest
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : a.name.localeCompare(b.name)));
  }, [collectionMixes, query, sortNewest]);

  const title = collection?.name || "My archive";
  const sortButton = (
    <button className="sort-button" onClick={() => setSortNewest((value) => !value)}>
      <ArrowDownUp size={15} /> {sortNewest ? "Newest first" : "Name A–Z"}
    </button>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL PAINT LIBRARY</div>
          <h1>{title}<span className="heading-period">.</span></h1>
          <p className="heading-subtitle">{collection ? `A hand-picked collection of ${visibleMixes.length} ${visibleMixes.length === 1 ? "mix" : "mixes"}.` : "Every good colour has a story. Keep yours."}</p>
        </div>
        <button className="primary-button" onClick={onNewMix} disabled={loading}>
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
          <span className="summary-copy"><span className="summary-label">PAINTS USED</span><strong>{uniquePaints} <small>unique paints</small></strong></span>
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
            <h2>{collection ? "Collection mixes" : "Your colour mixes"} <span className="mix-total">{collectionMixes.length}</span></h2>
            <p>{collection ? `Mixes saved in ${collection.name}.` : "Recipes worth remembering."}</p>
          </div>
          {collection ? (
            <div className="collection-controls">
              <button className="sort-button" onClick={() => onShareCollection(collection, collectionMixes)}><Share2 size={15} /> Share collection</button>
              <button className="sort-button" onClick={onManageCollection}><Plus size={15} /> Manage mixes</button>
              {visibleMixes.length > 0 && sortButton}
            </div>
          ) : mixes.length > 0 && (
            <div className="collection-controls">
              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mixes..." aria-label="Search mixes" />
                {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
              </label>
              {sortButton}
            </div>
          )}
        </div>

        {errors.filter(Boolean).map((message) => <div className="error-banner" role="alert" key={message}>{message}</div>)}
        {notice && <div className="success-banner" role="status"><Check size={16} />{notice}</div>}

        {loading ? (
          <div className="archive-loading" role="status">
            <LoaderCircle size={22} className="spin" />
            <span>Loading your archive…</span>
          </div>
        ) : loadFailed ? (
          <div className="empty-search">
            <h3>Your archive didn’t load</h3>
            <p>Check your internet connection, then try again.</p>
            <button className="primary-button" onClick={onRetry}>Try again</button>
          </div>
        ) : visibleMixes.length > 0 ? (
          <div className="mix-grid">
            {visibleMixes.map((mix) => <MixCard key={mix.id} mix={mix} onShare={onShareMix} onEdit={onEditMix} onDelete={onDeleteMix} />)}
          </div>
        ) : collection && !query.trim() ? (
          <div className="empty-search collection-empty">
            <Folder size={23} />
            <h3>This collection is ready for its first mix</h3>
            <p>Add mixes from your archive. They’ll stay in your archive too.</p>
            <button className="primary-button" onClick={onManageCollection}><Plus size={16} /> Add mixes</button>
          </div>
        ) : collection || mixes.length > 0 ? (
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
              <button className="primary-button" onClick={onNewMix}><Plus size={17} /> Log your first mix</button>
            </div>
            <div className="empty-side-note"><span>01</span><i /> YOUR COLOUR STORY BEGINS</div>
          </div>
        )}
      </section>
    </>
  );
}
