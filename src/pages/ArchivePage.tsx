import { Archive, Beaker, Check, ChevronDown, Folder, LoaderCircle, Pipette, Plus, Search, Share2, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Collection, Mix } from "../types";
import { MixCard } from "../components/mixes/MixCard";
import { COLOR_FAMILIES, colorFamily, hueSortKey, type ColorFamily } from "../lib/color";
import type { PaintShelf } from "../lib/paints";
import { paintKey } from "../lib/validation";

type SortOrder = "newest" | "oldest" | "name" | "hue";
const SORTS: { id: SortOrder; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name A–Z" },
  { id: "hue", label: "By colour" },
];

const time = (mix: Mix) => new Date(mix.createdAt).getTime();
const COMPARE: Record<SortOrder, (a: Mix, b: Mix) => number> = {
  newest: (a, b) => time(b) - time(a),
  oldest: (a, b) => time(a) - time(b),
  name: (a, b) => a.name.localeCompare(b.name),
  hue: (a, b) => hueSortKey(a.color) - hueSortKey(b.color),
};

interface ArchivePageProps {
  mixes: Mix[];
  /** The open collection, or null for the whole archive. */
  collection: Collection | null;
  shelf: PaintShelf;
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
  onToggleFavorite: (mix: Mix) => void;
  onMatchColor: () => void;
  onShareCollection: (collection: Collection, mixes: Mix[]) => void;
  onManageCollection: () => void;
}

/** "My archive" and a single collection: heading, summary, filters, sort and the mix grid. */
export function ArchivePage({
  mixes, collection, shelf, loading, loadFailed, errors, notice,
  onRetry, onNewMix, onEditMix, onDeleteMix, onShareMix, onToggleFavorite, onMatchColor, onShareCollection, onManageCollection,
}: ArchivePageProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [family, setFamily] = useState<ColorFamily | null>(null);
  const [paintFilter, setPaintFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const collectionMixes = useMemo(() => (collection ? mixes.filter((mix) => collection.mixIds.includes(mix.id)) : mixes), [mixes, collection]);
  const uniquePaints = useMemo(() => new Set(mixes.flatMap((mix) => mix.paints.map((paint) => `${paint.brand}:${paint.name}`))).size, [mixes]);
  const recentColors = useMemo(() => [...mixes].sort(COMPARE.newest).slice(0, 5).map((mix) => mix.color), [mixes]);

  // Filters only offer what this view contains.
  const familyCounts = useMemo(() => {
    const counts = new Map<ColorFamily, number>();
    for (const mix of collectionMixes) counts.set(colorFamily(mix.color), (counts.get(colorFamily(mix.color)) || 0) + 1);
    return counts;
  }, [collectionMixes]);
  const paintOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const mix of collectionMixes) {
      for (const paint of mix.paints) if (paint.name.trim()) options.set(paintKey(paint.brand, paint.name), `${paint.name.trim()} · ${paint.brand}`);
    }
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }, [collectionMixes]);
  const favoriteCount = collectionMixes.filter((mix) => mix.favorite).length;

  const filtersActive = Boolean(query.trim() || family || paintFilter || favoritesOnly);
  const visibleMixes = useMemo(() => {
    const search = query.trim().toLowerCase();
    return collectionMixes
      .filter((mix) => !search || [mix.name, mix.notes, ...mix.paints.map((paint) => `${paint.name} ${paint.brand}`)].join(" ").toLowerCase().includes(search))
      .filter((mix) => !family || colorFamily(mix.color) === family)
      .filter((mix) => !paintFilter || mix.paints.some((paint) => paintKey(paint.brand, paint.name) === paintFilter))
      .filter((mix) => !favoritesOnly || mix.favorite)
      // Favourites always lead; the chosen order applies within each group.
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || COMPARE[sort](a, b));
  }, [collectionMixes, query, family, paintFilter, favoritesOnly, sort]);

  function clearFilters() {
    setQuery("");
    setFamily(null);
    setPaintFilter("");
    setFavoritesOnly(false);
  }

  const title = collection?.name || "My archive";

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL PAINT LIBRARY</div>
          <h1>{title}<span className="heading-period">.</span></h1>
          <p className="heading-subtitle">{collection ? `A hand-picked collection of ${collectionMixes.length} ${collectionMixes.length === 1 ? "mix" : "mixes"}.` : "Every good colour has a story. Keep yours."}</p>
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
          <div className="palette-swatches" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => <i key={index} style={recentColors[index] ? { backgroundColor: recentColors[index] } : undefined} />)}
          </div>
          <span className="summary-copy"><span className="summary-label">YOUR PALETTE</span><strong><small>{recentColors.length ? "Your latest colours" : "A collection in the making"}</small></strong></span>
          <span className="summary-decoration">03</span>
        </div>
      </section>

      <section className="collection-section">
        <div className="section-title-row">
          <div>
            <h2>{collection ? "Collection mixes" : "Your colour mixes"} <span className="mix-total">{collectionMixes.length}</span></h2>
            <p>{collection ? `Mixes saved in ${collection.name}.` : "Recipes worth remembering."}</p>
          </div>
          <div className="collection-controls">
            {collection && (
              <>
                <button className="sort-button" onClick={() => onShareCollection(collection, collectionMixes)}><Share2 size={15} /> Share collection</button>
                <button className="sort-button" onClick={onManageCollection}><Plus size={15} /> Manage mixes</button>
              </>
            )}
            {mixes.length > 0 && <button className="sort-button" onClick={onMatchColor}><Pipette size={15} /> Match a colour</button>}
          </div>
        </div>

        {collectionMixes.length > 0 && (
          <div className="archive-filters">
            <div className="filter-row">
              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mixes..." aria-label="Search mixes" />
                {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
              </label>
              {paintOptions.length > 1 && (
                <label className="select-control">
                  <span className="sr-only">Filter by paint</span>
                  <select value={paintFilter} onChange={(event) => setPaintFilter(event.target.value)}>
                    <option value="">Any paint</option>
                    {paintOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </label>
              )}
              {favoriteCount > 0 && (
                <button className={`sort-button favorites-toggle ${favoritesOnly ? "on" : ""}`} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((on) => !on)}>
                  <Star size={15} fill={favoritesOnly ? "currentColor" : "none"} /> Favourites <span className="filter-count">{favoriteCount}</span>
                </button>
              )}
              <label className="select-control">
                <span className="sr-only">Sort mixes</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}>
                  {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
            </div>
            {familyCounts.size > 1 && (
              <div className="family-chips" role="group" aria-label="Filter by colour family">
                <button className={`family-chip ${family ? "" : "on"}`} aria-pressed={!family} onClick={() => setFamily(null)}>All colours</button>
                {COLOR_FAMILIES.filter((option) => familyCounts.has(option.id)).map((option) => (
                  <button
                    key={option.id}
                    className={`family-chip ${family === option.id ? "on" : ""}`}
                    aria-pressed={family === option.id}
                    onClick={() => setFamily((current) => (current === option.id ? null : option.id))}
                  >
                    <i style={{ backgroundColor: option.sample }} aria-hidden="true" />
                    {option.label} <span className="filter-count">{familyCounts.get(option.id)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
            {visibleMixes.map((mix) => (
              <MixCard key={mix.id} mix={mix} shelf={shelf} onShare={onShareMix} onEdit={onEditMix} onDelete={onDeleteMix} onToggleFavorite={onToggleFavorite} />
            ))}
          </div>
        ) : collection && !filtersActive ? (
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
            <button className="text-button" onClick={clearFilters}>{query && !family && !paintFilter && !favoritesOnly ? "Clear search" : "Clear filters"}</button>
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
