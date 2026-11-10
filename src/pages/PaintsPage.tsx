import { Check, ChevronDown, ClipboardCopy, ListChecks, LoaderCircle, PaintBucket, Pencil, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink } from "react-router";
import type { OwnedPaint, PaintInput, PaintStatus } from "../types";
import type { ArchiveApi } from "../hooks/useArchive";
import { useSelection } from "../hooks/useSelection";
import { paintsInUse, PaintShelf, shoppingList, shoppingListText, STATUS_LABELS, type PaintUse } from "../lib/paints";
import { plural } from "../lib/validation";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageBanners, PageHeading } from "../components/PageHeading";
import { PaintForm } from "../components/paints/PaintForm";
import { SelectionBar } from "../components/SelectionBar";

interface PaintsPageProps {
  tab: "shelf" | "shopping";
  archive: ArchiveApi;
  errors: string[];
  notice: string;
  showNotice: (message: string, duration?: number) => void;
}

type Dialog = null | { type: "form"; paint: OwnedPaint | null; initial?: Partial<PaintInput> } | { type: "delete"; paint: OwnedPaint } | { type: "deleteMany" };

const usageText = (use: PaintUse | undefined) => {
  if (!use) return "Not used yet";
  const parts = [use.mixIds.length && plural(use.mixIds.length, "mix", "mixes"), use.recipeIds.length && plural(use.recipeIds.length, "recipe")].filter(Boolean);
  return parts.length ? `Used in ${parts.join(" and ")}` : "Not used yet";
};

/** My paints (what's on the shelf) and the shopping list worked out from it. */
export function PaintsPage({ tab, archive, errors, notice, showNotice }: PaintsPageProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaintStatus | null>(null);
  const { paints, mixes, recipes, busy } = archive;

  const uses = useMemo(() => paintsInUse(mixes, recipes), [mixes, recipes]);
  const shelf = useMemo(() => new PaintShelf(paints), [paints]);
  const shopping = useMemo(() => shoppingList(paints, uses), [paints, uses]);
  const unlisted = useMemo(() => uses.filter((use) => !shelf.find(use.brand, use.name)), [uses, shelf]);
  const usageOf = (paint: OwnedPaint) => uses.find((use) => shelf.find(use.brand, use.name)?.id === paint.id);

  const grouped = useMemo(() => {
    const search = query.trim().toLowerCase();
    const groups = new Map<string, OwnedPaint[]>();
    for (const paint of [...paints].sort((a, b) => a.name.localeCompare(b.name))) {
      if (statusFilter && paint.status !== statusFilter) continue;
      if (search && !`${paint.name} ${paint.brand}`.toLowerCase().includes(search)) continue;
      const brand = paint.brand || "No brand";
      groups.set(brand, [...(groups.get(brand) || []), paint]);
    }
    return [...groups].sort((a, b) => a[0].localeCompare(b[0]));
  }, [paints, query, statusFilter]);

  // Select mode covers the paints on screen; one hidden by the search or a filter is never removed unseen.
  const visiblePaints = useMemo(() => grouped.flatMap(([, list]) => list), [grouped]);
  const visibleIds = useMemo(() => visiblePaints.map((paint) => paint.id), [visiblePaints]);
  const selection = useSelection(tab === "shelf" ? visibleIds : []);
  const selectedPaints = visiblePaints.filter((paint) => selection.selected.includes(paint.id));

  async function removeSelected() {
    if (await archive.deletePaints(selectedPaints.map((paint) => paint.id))) {
      showNotice(`${plural(selectedPaints.length, "paint")} removed from My paints.`);
      setDialog(null);
      selection.stop();
    }
  }

  function openForm(paint: OwnedPaint | null, initial?: Partial<PaintInput>) {
    archive.setError("");
    setDialog({ type: "form", paint, initial });
  }

  async function save(values: PaintInput) {
    if (dialog?.type !== "form") return;
    if (await archive.savePaint(values, dialog.paint)) {
      setDialog(null);
      showNotice(dialog.paint ? "Paint updated." : `${values.name} added to My paints.`);
    }
  }

  async function setStatus(paint: OwnedPaint, status: PaintStatus) {
    if (await archive.savePaint({ ...paint, status }, paint)) showNotice(`${paint.name}: ${STATUS_LABELS[status].toLowerCase()}.`);
  }

  async function addFromUse(use: PaintUse, status: PaintStatus) {
    const saved = await archive.savePaint({ name: use.name, brand: use.brand, swatch: use.swatch || "#8593aa", status }, null);
    if (saved) showNotice(status === "want" ? `${use.name} added to your wishlist.` : `${use.name} added to My paints.`);
  }

  async function addAllUnlisted() {
    let added = 0;
    for (const use of unlisted) {
      if (!await archive.savePaint({ name: use.name, brand: use.brand, swatch: use.swatch || "#8593aa", status: "have" }, null)) break;
      added += 1;
    }
    if (added) showNotice(`${plural(added, "paint")} added to My paints.`);
  }

  async function remove() {
    if (dialog?.type !== "delete") return;
    if (await archive.deletePaint(dialog.paint.id)) {
      showNotice(`${dialog.paint.name} removed from My paints.`);
      setDialog(null);
    }
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(shoppingListText(shopping));
      showNotice("Shopping list copied. Paste it into a note or a message.", 4000);
    } catch {
      archive.setError("The list couldn't be copied. Your browser may have blocked the clipboard.");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="YOUR PAINT SHELF"
        title={tab === "shelf" ? "My paints" : "Shopping list"}
        subtitle={tab === "shelf"
          ? "The paints you own. Mixes and recipes mark anything you don't have."
          : "Paints running low, on your wishlist, or used in your mixes but missing from your shelf."}
        action={tab === "shelf"
          ? <button className="primary-button" onClick={() => openForm(null)} disabled={archive.loading}><Plus size={18} strokeWidth={2.4} /> Add paint</button>
          : shopping.length > 0 && <button className="primary-button" onClick={copyList}><ClipboardCopy size={17} /> Copy list</button>}
      />

      <nav className="page-tabs" aria-label="Paints">
        <NavLink to="/paints" end className={({ isActive }) => `page-tab ${isActive ? "active" : ""}`}><PaintBucket size={15} /> My paints <span className="filter-count">{paints.filter((paint) => paint.status !== "want").length}</span></NavLink>
        <NavLink to="/paints/shopping" className={({ isActive }) => `page-tab ${isActive ? "active" : ""}`}><ShoppingCart size={15} /> Shopping list <span className="filter-count">{shopping.length}</span></NavLink>
      </nav>

      <PageBanners errors={errors} notice={notice} />

      {archive.loading ? (
        <div className="archive-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Loading your paints…</span></div>
      ) : tab === "shelf" ? (
        <>
          <section className="collection-section">
            {paints.length > 0 && (
              <div className="archive-filters">
                <div className="filter-row">
                  <label className="search-box">
                    <Search size={16} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paints..." aria-label="Search paints" />
                    {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
                  </label>
                  {visiblePaints.length > 0 && !selection.active && <button className="sort-button" onClick={selection.start}><ListChecks size={15} /> Select</button>}
                </div>
                <div className="family-chips" role="group" aria-label="Filter by status">
                  <button className={`family-chip ${statusFilter ? "" : "on"}`} aria-pressed={!statusFilter} onClick={() => setStatusFilter(null)}>All</button>
                  {(Object.keys(STATUS_LABELS) as PaintStatus[]).map((status) => (
                    <button key={status} className={`family-chip ${statusFilter === status ? "on" : ""}`} aria-pressed={statusFilter === status} onClick={() => setStatusFilter((current) => (current === status ? null : status))}>
                      <i className={`status-dot-${status}`} aria-hidden="true" />{STATUS_LABELS[status]} <span className="filter-count">{paints.filter((paint) => paint.status === status).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {grouped.length > 0 ? (
              <div className="paint-groups">
                {grouped.map(([brand, list]) => (
                  <section className="paint-group" key={brand} aria-label={brand}>
                    <h3>{brand} <span className="mix-total">{list.length}</span></h3>
                    <ul className="paint-rows">
                      {list.map((paint) => (
                        <li
                          className={`paint-row status-${paint.status} ${selection.active ? "selecting" : ""} ${selection.isSelected(paint.id) ? "selected" : ""}`}
                          key={paint.id}
                          // In select mode the whole row picks the paint, except its own controls.
                          onClick={selection.active ? (event) => { if (!(event.target as HTMLElement).closest("input, select, label, button")) selection.toggle(paint.id); } : undefined}
                        >
                          {selection.active && (
                            <label className="row-select">
                              <input type="checkbox" checked={selection.isSelected(paint.id)} onChange={() => selection.toggle(paint.id)} aria-label={`Select ${paint.name}`} />
                            </label>
                          )}
                          <span className="paint-swatch" style={{ backgroundColor: paint.swatch }} aria-hidden="true" />
                          <span className="paint-row-copy"><strong>{paint.name}</strong><small>{usageText(usageOf(paint))}</small></span>
                          {!selection.active && <label className="select-control status-select">
                            <span className="sr-only">Status of {paint.name}</span>
                            <select value={paint.status} onChange={(event) => setStatus(paint, event.target.value as PaintStatus)} disabled={busy}>
                              {(Object.keys(STATUS_LABELS) as PaintStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                            </select>
                            <ChevronDown size={14} aria-hidden="true" />
                          </label>}
                          {selection.active
                            ? <span className="row-status">{STATUS_LABELS[paint.status]}</span>
                            : (
                              <span className="paint-row-actions">
                                <button className="edit-button" onClick={() => openForm(paint)} aria-label={`Edit ${paint.name}`} title={`Edit ${paint.name}`}><Pencil size={14} /></button>
                                <button className="delete-button" onClick={() => setDialog({ type: "delete", paint })} aria-label={`Remove ${paint.name}`} title={`Remove ${paint.name}`}><Trash2 size={14} /></button>
                              </span>
                            )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : paints.length > 0 ? (
              <div className="empty-search">
                <Search size={22} />
                <h3>No paints found</h3>
                <p>Try a different name or brand.</p>
                <button className="text-button" onClick={() => { setQuery(""); setStatusFilter(null); }}>Clear filters</button>
              </div>
            ) : (
              <div className="empty-search page-empty">
                <PaintBucket size={23} />
                <h3>Put your shelf on the list</h3>
                <p>Add the paints you own. Then your mixes and recipes can show what you’re missing, and the shopping list fills itself in.</p>
                <button className="primary-button" onClick={() => openForm(null)}><Plus size={16} /> Add paint</button>
              </div>
            )}
          </section>

          {unlisted.length > 0 && (
            <section className="collection-section unlisted-section">
              <div className="section-title-row">
                <div>
                  <h2>In your mixes, not on your list <span className="mix-total">{unlisted.length}</span></h2>
                  <p>Add the ones you own, or put them on your wishlist.</p>
                </div>
                <div className="collection-controls">
                  <button className="sort-button" onClick={addAllUnlisted} disabled={busy}><Check size={15} /> I own all of these</button>
                </div>
              </div>
              <ul className="paint-rows unlisted">
                {unlisted.map((use) => (
                  <li className="paint-row" key={use.key}>
                    <span className={`paint-swatch ${use.swatch ? "" : "unknown"}`} style={use.swatch ? { backgroundColor: use.swatch } : undefined} aria-hidden="true" />
                    <span className="paint-row-copy"><strong>{use.name}</strong><small>{[use.brand, usageText(use)].filter(Boolean).join(" · ")}</small></span>
                    <span className="paint-row-actions wide">
                      <button className="sort-button" onClick={() => addFromUse(use, "have")} disabled={busy} aria-label={`I own ${use.name}`}><Check size={14} /> I own it</button>
                      <button className="sort-button" onClick={() => addFromUse(use, "want")} disabled={busy} aria-label={`Add ${use.name} to wishlist`}><ShoppingCart size={14} /> Wishlist</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="collection-section">
          {shopping.length > 0 ? (
            <ul className="paint-rows shopping-rows">
              {shopping.map((item) => {
                const name = item.kind === "missing" ? item.use.name : item.paint.name;
                const brand = item.kind === "missing" ? item.use.brand : item.paint.brand;
                const swatch = item.kind === "missing" ? item.use.swatch : item.paint.swatch;
                const reason = item.kind === "low" ? "Running low" : item.kind === "want" ? "Wishlist" : "Not on your shelf";
                return (
                  <li className={`paint-row shopping-${item.kind}`} key={item.kind === "missing" ? item.use.key : item.paint.id}>
                    <span className={`paint-swatch ${swatch ? "" : "unknown"}`} style={swatch ? { backgroundColor: swatch } : undefined} aria-hidden="true" />
                    <span className="paint-row-copy">
                      <strong>{name}</strong>
                      <small>{[brand, item.use ? usageText(item.use) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className={`shopping-reason reason-${item.kind}`}>{reason}</span>
                    <span className="paint-row-actions wide">
                      <button
                        className="sort-button"
                        disabled={busy}
                        aria-label={`Bought ${name}`}
                        onClick={() => (item.kind === "missing" ? addFromUse(item.use, "have") : setStatus(item.paint, "have"))}
                      >
                        <Check size={14} /> Bought
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-search page-empty">
              <ShoppingCart size={23} />
              <h3>Nothing to buy</h3>
              <p>Mark a paint as running low or put one on your wishlist, and it shows up here. Once My paints has your shelf on it, paints your mixes need that you don’t own appear here too.</p>
            </div>
          )}
        </section>
      )}

      {dialog?.type === "form" && (
        <PaintForm
          paint={dialog.paint}
          initial={dialog.initial}
          paints={paints}
          busy={busy}
          saveError={archive.kind === "cloud" ? archive.error : ""}
          onSave={save}
          onClose={() => { if (!busy) setDialog(null); }}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          id="delete-paint"
          icon={<Trash2 size={18} />}
          title="Remove this paint?"
          description={<><strong>{dialog.paint.name}</strong> will be taken off My paints. Mixes that use it keep it.</>}
          onClose={() => setDialog(null)}
          actions={(
            <>
              <button autoFocus onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
              <button className="confirm-delete" onClick={remove} disabled={busy}>{busy ? "Removing…" : "Remove paint"}</button>
            </>
          )}
        />
      )}
      {tab === "shelf" && selection.active && (
        <SelectionBar
          count={selectedPaints.length}
          noun={["paint", "paints"]}
          total={visiblePaints.length}
          busy={busy}
          onSelectAll={() => selection.selectAll(visibleIds)}
          onClearAll={() => selection.selectAll([])}
          onDelete={() => setDialog({ type: "deleteMany" })}
          onCancel={selection.stop}
        />
      )}
      {dialog?.type === "deleteMany" && (
        <ConfirmDialog
          id="delete-paints"
          icon={<Trash2 size={18} />}
          title={`Remove ${plural(selectedPaints.length, "paint")}?`}
          description={(
            <>
              {selectedPaints.length <= 3
                ? <strong>{selectedPaints.map((paint) => paint.name).join(", ")}</strong>
                : <><strong>{selectedPaints.slice(0, 3).map((paint) => paint.name).join(", ")}</strong> and {plural(selectedPaints.length - 3, "other")}</>}
              {" "}will be taken off My paints. Mixes that use them keep them.
            </>
          )}
          onClose={() => setDialog(null)}
          actions={(
            <>
              <button autoFocus onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
              <button className="confirm-delete" onClick={removeSelected} disabled={busy}>{busy ? "Removing…" : `Remove ${plural(selectedPaints.length, "paint")}`}</button>
            </>
          )}
        />
      )}
    </>
  );
}
