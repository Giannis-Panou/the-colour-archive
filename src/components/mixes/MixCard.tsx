import { Pencil, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Mix } from "../../types";
import { MixSwatch } from "./MixSwatch";
import { PaintList } from "./PaintList";

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

interface MixCardProps {
  mix: Mix;
  onShare: (mix: Mix) => void;
  onEdit: (mix: Mix) => void;
  onDelete: (mix: Mix) => void;
}

export function MixCard({ mix, onShare, onEdit, onDelete }: MixCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const totalDrops = mix.paints.reduce((total, paint) => total + Number(paint.drops), 0);

  return (
    <article className="mix-card">
      <MixSwatch mix={mix} className="mix-image">
        <div className="mix-card-actions">
          <button className="share-button" onClick={() => onShare(mix)} aria-label={`Share ${mix.name}`} title={`Share ${mix.name}`}><Share2 size={15} /></button>
          <button className="edit-button" onClick={() => onEdit(mix)} aria-label={`Edit ${mix.name}`} title={`Edit ${mix.name}`}><Pencil size={15} /></button>
          <button className="delete-button" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${mix.name}`} title={`Delete ${mix.name}`}><Trash2 size={15} /></button>
        </div>
      </MixSwatch>
      <div className="mix-card-body">
        <PaintList mix={mix} />
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
