import { Pencil, Share2, Star, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { Mix } from "../../types";
import type { PaintShelf } from "../../lib/paints";
import { MixSwatch } from "./MixSwatch";
import { PaintList } from "./PaintList";

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

interface MixCardProps {
  mix: Mix;
  /** My paints, to mark paints the mix needs that aren't owned. */
  shelf?: PaintShelf;
  onShare: (mix: Mix) => void;
  onEdit: (mix: Mix) => void;
  onDelete: (mix: Mix) => void;
  onToggleFavorite: (mix: Mix) => void;
  /** Opens the mix's details. */
  onView: (mix: Mix) => void;
}

export function MixCard({ mix, shelf, onShare, onEdit, onDelete, onToggleFavorite, onView }: MixCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const totalDrops = mix.paints.reduce((total, paint) => total + Number(paint.drops), 0);
  const favoriteLabel = mix.favorite ? `Remove ${mix.name} from favourites` : `Add ${mix.name} to favourites`;

  // A click anywhere on the card opens its details, except on its own buttons and the delete check.
  function openFromCard(event: MouseEvent<HTMLElement>) {
    if (confirmDelete || (event.target as HTMLElement).closest("button, a, .confirm-overlay")) return;
    onView(mix);
  }

  return (
    <article className={`mix-card ${mix.favorite ? "favorite" : ""}`} onClick={openFromCard}>
      <MixSwatch mix={mix} className="mix-image">
        {/* The keyboard way in; the card's click handler covers the mouse. */}
        <button className="mix-open" onClick={() => onView(mix)} aria-label={`View ${mix.name}`} title={`View ${mix.name}`} />

        <div className="mix-card-actions">
          <button
            className={`favorite-button ${mix.favorite ? "on" : ""}`}
            onClick={() => onToggleFavorite(mix)}
            aria-label={favoriteLabel}
            aria-pressed={Boolean(mix.favorite)}
            title={favoriteLabel}
          >
            <Star size={15} fill={mix.favorite ? "currentColor" : "none"} />
          </button>
          <button className="share-button" onClick={() => onShare(mix)} aria-label={`Share ${mix.name}`} title={`Share ${mix.name}`}><Share2 size={15} /></button>
          <button className="edit-button" onClick={() => onEdit(mix)} aria-label={`Edit ${mix.name}`} title={`Edit ${mix.name}`}><Pencil size={15} /></button>
          <button className="delete-button" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${mix.name}`} title={`Delete ${mix.name}`}><Trash2 size={15} /></button>
        </div>
      </MixSwatch>
      <div className="mix-card-body">
        <PaintList mix={mix} shelf={shelf} />
        <div className="mix-card-footer">
          <span>{mix.notes ? mix.notes : `${totalDrops} ${totalDrops === 1 ? "drop" : "drops"} in this mix`}</span>
          <time dateTime={mix.createdAt}>{dateFormat.format(new Date(mix.createdAt))}</time>
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
              <button className="confirm-delete" onClick={() => onDelete(mix)}>Remove mix</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
