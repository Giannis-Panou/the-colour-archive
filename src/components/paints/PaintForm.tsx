import { Check, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { OwnedPaint, PaintInput, PaintStatus } from "../../types";
import { DEFAULT_BRANDS, STATUS_LABELS } from "../../lib/paints";
import { paintKey } from "../../lib/validation";
import { Modal } from "../Modal";


interface PaintFormProps {
  /** The paint to edit, or null to add one. `initial` pre-fills a new one. */
  paint: OwnedPaint | null;
  initial?: Partial<PaintInput>;
  paints: OwnedPaint[];
  busy: boolean;
  saveError: string;
  onSave: (values: PaintInput) => void;
  onClose: () => void;
}

export function PaintForm({ paint, initial, paints, busy, saveError, onSave, onClose }: PaintFormProps) {
  const [name, setName] = useState(paint?.name ?? initial?.name ?? "");
  const [brand, setBrand] = useState(paint?.brand ?? initial?.brand ?? "Citadel");
  const [swatch, setSwatch] = useState(paint?.swatch ?? (initial?.swatch || "#8593aa"));
  const [status, setStatus] = useState<PaintStatus>(paint?.status ?? initial?.status ?? "have");
  const [error, setError] = useState("");
  const brands = [...new Set([...DEFAULT_BRANDS, ...paints.map((item) => item.brand).filter(Boolean)])];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Give the paint a name.");
    const key = paintKey(brand, name);
    if (paints.some((item) => item.id !== paint?.id && paintKey(item.brand, item.name) === key)) {
      return setError("That paint is already on your list.");
    }
    onSave({ name: name.trim(), brand: brand.trim(), swatch, status });
  }

  return (
    <Modal onClose={onClose} labelledBy="paint-form-title" className="collection-modal paint-modal">
      <div className="modal-header">
        <div><span className="modal-eyebrow">{paint ? "UPDATE YOUR SHELF" : "ADD TO YOUR SHELF"}</span><h2 id="paint-form-title">{paint ? "Edit paint" : "Add a paint"}<span>.</span></h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close paint form"><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="collection-form-content">
          <label className="field-label">Paint name
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Abaddon Black" autoFocus maxLength={50} />
          </label>
          <label className="field-label">Brand
            <input className="text-input" value={brand} onChange={(event) => setBrand(event.target.value)} list="paint-brands" maxLength={40} autoComplete="off" />
            <datalist id="paint-brands">{brands.map((option) => <option key={option} value={option} />)}</datalist>
          </label>
          <div className="field-label color-field-label">Swatch
            <div className="color-input-wrap">
              <input type="color" value={swatch} onChange={(event) => setSwatch(event.target.value)} aria-label="Paint swatch colour" />
              <span>{swatch.toUpperCase()}</span>
              <span className="color-field-hint">Roughly how it looks in the pot</span>
            </div>
          </div>
          <fieldset className="status-picker">
            <legend>Status</legend>
            {(Object.keys(STATUS_LABELS) as PaintStatus[]).map((option) => (
              <label key={option} className={status === option ? "selected" : ""}>
                <input type="radio" name="paint-status" value={option} checked={status === option} onChange={() => setStatus(option)} />
                {STATUS_LABELS[option]}
              </label>
            ))}
          </fieldset>
          {(error || saveError) && <div className="form-error" role="alert">{error || saveError}</div>}
        </div>
        <div className="modal-footer">
          <span />
          <div>
            <button className="cancel-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {busy ? "Saving…" : paint ? "Save paint" : "Add paint"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
