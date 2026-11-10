import { Check, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../Modal";

interface PhotoDialogProps {
  /** The prepared photo, as a data URL. */
  image: string;
  busy: boolean;
  saveError: string;
  onSave: (caption: string) => void;
  onClose: () => void;
}

/** Preview a progress photo and give it a caption before saving it. */
export function PhotoDialog({ image, busy, saveError, onSave, onClose }: PhotoDialogProps) {
  const [caption, setCaption] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy) onSave(caption.trim());
  }

  return (
    <Modal onClose={onClose} labelledBy="photo-title" className="collection-modal photo-modal">
      <div className="modal-header">
        <div><span className="modal-eyebrow">PROGRESS PHOTO</span><h2 id="photo-title">Add a photo<span>.</span></h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close photo dialog"><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="collection-form-content">
          <img className="photo-preview" src={image} alt="The photo you chose" />
          <label className="field-label">Caption <span className="optional-label">OPTIONAL</span>
            <input className="text-input" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="e.g. Base coats done" autoFocus maxLength={80} />
          </label>
          {saveError && <div className="form-error" role="alert">{saveError}</div>}
        </div>
        <div className="modal-footer">
          <span />
          <div>
            <button className="cancel-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {busy ? "Saving…" : "Save photo"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
