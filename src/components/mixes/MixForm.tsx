import { Check, ChevronDown, ImagePlus, LoaderCircle, Plus, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Mix, MixInput, OwnedPaint, Paint } from "../../types";
import { preparePhoto } from "../../lib/images";
import { DEFAULT_BRANDS } from "../../lib/paints";
import { Modal } from "../Modal";
import { ColorSampler } from "./ColorSampler";

const NEW_PAINT: Paint = { name: "", brand: "The Army Painter", drops: "1", swatch: "#8593aa" };

interface MixFormProps {
  /** The mix to edit, or null for a new one. */
  mix: Mix | null;
  /** My paints: suggested as paint names, and used to fill in the brand. */
  ownedPaints: OwnedPaint[];
  busy: boolean;
  /** An error from saving, shown inside the form. */
  saveError: string;
  onSave: (values: MixInput) => void;
  onClose: () => void;
}

export function MixForm({ mix, ownedPaints, busy, saveError, onSave, onClose }: MixFormProps) {
  const [name, setName] = useState(mix?.name || "");
  const [color, setColor] = useState(mix?.color || "#7187a1");
  const [notes, setNotes] = useState(mix?.notes || "");
  const [image, setImage] = useState(mix?.image || "");
  const [imageName, setImageName] = useState(mix?.image ? "Current photo" : "");
  const [paints, setPaints] = useState<Paint[]>(() => mix?.paints.map((paint) => ({ ...paint })) || [{ ...NEW_PAINT }]);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const showError = useCallback((message: string) => setError(message), []);

  // Brands offered: the usual ones, any on My paints, and any this mix already uses.
  const brands = useMemo(() => [...new Set([
    ...DEFAULT_BRANDS.filter((brand) => brand !== "Other"),
    ...ownedPaints.map((paint) => paint.brand.trim()).filter(Boolean),
    ...(mix?.paints.map((paint) => paint.brand) || []),
    "Other",
  ])], [ownedPaints, mix]);
  const suggestions = useMemo(() => [...ownedPaints].sort((a, b) => a.name.localeCompare(b.name)), [ownedPaints]);

  function updatePaint(index: number, key: keyof Paint, value: string) {
    setPaints((current) => current.map((paint, paintIndex) => (paintIndex === index ? { ...paint, [key]: value } : paint)));
  }

  /** Typing or picking a paint from My paints fills in its brand and swatch. */
  function updatePaintName(index: number, value: string) {
    const matches = ownedPaints.filter((paint) => paint.name.trim().toLowerCase() === value.trim().toLowerCase());
    const match = matches.length === 1 ? matches[0] : null;
    setPaints((current) => current.map((paint, paintIndex) => (paintIndex === index
      ? { ...paint, name: value, ...(match ? { brand: match.brand, swatch: match.swatch } : {}) }
      : paint)));
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setImage(await preparePhoto(file));
      setImageName(file.name);
      setError("");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "The photo could not be read. Please try another image.");
      input.value = "";
    }
  }

  function removePhoto() {
    setImage("");
    setImageName("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanPaints = paints.filter((paint) => paint.name.trim());
    if (!name.trim()) return setError("Give your mix a name before saving.");
    if (!cleanPaints.length) return setError("Add at least one paint to your recipe.");
    if (cleanPaints.some((paint) => !Number.isInteger(Number(paint.drops)) || Number(paint.drops) < 1)) {
      return setError("Each paint needs a whole number of drops (at least 1).");
    }
    if (busy) return;
    onSave({ name: name.trim(), color, notes: notes.trim(), image, paints: cleanPaints });
  }

  return (
    <Modal onClose={onClose} labelledBy="form-title" className="mix-modal">
      <div className="modal-header">
        <div><span className="modal-eyebrow">{mix ? "UPDATE YOUR ARCHIVE" : "ADD TO YOUR ARCHIVE"}</span><h2 id="form-title">{mix ? "Edit colour mix" : "A new colour mix"}<span>.</span></h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close form"><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="form-scroll-area">
          <label className="field-label"><span className="field-label-text">What are you calling it?<span className="required-mark" aria-hidden="true">*</span></span>
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
                <label className="ingredient-input paint-field"><span className="sr-only">Paint name</span><input value={paint.name} onChange={(event) => updatePaintName(index, event.target.value)} placeholder="Paint name" maxLength={50} list={suggestions.length ? "owned-paint-names" : undefined} autoComplete="off" /></label>
                <label className="ingredient-input brand-field"><span className="sr-only">Paint brand</span>
                  <select value={paint.brand} onChange={(event) => updatePaint(index, "brand", event.target.value)}>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select>
                  <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                </label>
                <label className="ingredient-input drops-field"><span className="sr-only">Number of drops</span><input type="number" min="1" step="1" value={paint.drops} onChange={(event) => updatePaint(index, "drops", event.target.value)} /><small>drops</small></label>
              </div>
            ))}
          </div>
          {suggestions.length > 0 && (
            <datalist id="owned-paint-names">
              {suggestions.map((paint) => <option key={paint.id} value={paint.name}>{paint.brand}</option>)}
            </datalist>
          )}
          <button className="add-paint-button" type="button" onClick={() => setPaints((current) => [...current, { ...NEW_PAINT, swatch: "#ad8064" }])}><Plus size={15} /> Add another paint</button>

          <div className="form-lower-grid">
            <label className="field-label"><span className="field-label-text">A note for later <span className="optional-label">OPTIONAL</span></span>
              <textarea className="text-input notes-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What did you use it for? Any tips for next time?" maxLength={240} />
            </label>
            <div className="field-label"><span className="field-label-text">A photo of your mix <span className="optional-label">OPTIONAL</span></span>
              {!image && (
                <button className="upload-zone" type="button" onClick={() => fileInput.current?.click()}>
                  <span className="upload-icon"><ImagePlus size={18} /></span><span className="upload-copy"><strong>{imageName || "Add a photo"}</strong><small>JPG, PNG or WebP · up to 8 MB, resized</small></span><Plus size={17} className="upload-plus" />
                </button>
              )}
              <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={handleImage} />
              {image && (
                <>
                  <ColorSampler image={image} onPick={setColor} onError={showError} />
                  <div className="photo-actions">
                    <button type="button" className="remove-photo" onClick={() => fileInput.current?.click()}>Choose another photo</button>
                    <button type="button" className="remove-photo" onClick={removePhoto}>Remove photo</button>
                  </div>
                </>
              )}
            </div>
          </div>
          {(error || saveError) && <div className="form-error" role="alert">{error || saveError}</div>}
        </div>
        <div className="modal-footer">
          <span><span className="local-lock">◈</span> Saved privately on this device</span>
          <div>
            <button className="cancel-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {busy ? "Saving…" : mix ? "Save changes" : "Save mix"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
