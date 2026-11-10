import { CheckCheck, Trash2, X } from "lucide-react";

interface SelectionBarProps {
  /** How many are picked, and the noun for one and for many, e.g. "mix" / "mixes". */
  count: number;
  noun: [string, string];
  /** How many could be picked, for "Select all". */
  total: number;
  busy: boolean;
  onSelectAll: () => void;
  onClearAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

/** The bar along the bottom of the screen while picking several items. */
export function SelectionBar({ count, noun, total, busy, onSelectAll, onClearAll, onDelete, onCancel }: SelectionBarProps) {
  const allPicked = count > 0 && count === total;
  return (
    <div className="selection-bar" role="region" aria-label="Selection">
      <span className="selection-count" aria-live="polite">
        <strong>{count}</strong> {count === 1 ? noun[0] : noun[1]} selected
      </span>
      <div className="selection-actions">
        <button className="sort-button" onClick={allPicked ? onClearAll : onSelectAll} disabled={!total}>
          <CheckCheck size={15} /> {allPicked ? "Select none" : `Select all ${total}`}
        </button>
        <button className="sort-button danger" onClick={onDelete} disabled={!count || busy}>
          <Trash2 size={15} /> Delete
        </button>
        <button className="sort-button" onClick={onCancel} aria-label="Stop selecting"><X size={15} /> Cancel</button>
      </div>
    </div>
  );
}
