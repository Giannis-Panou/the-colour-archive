import { Archive, Check, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Collection, CollectionInput, Mix } from "../../types";
import { Modal } from "../Modal";

interface CollectionFormProps {
  mixes: Mix[];
  collections: Collection[];
  /** The collection to manage, or null to create one. */
  collection: Collection | null;
  busy: boolean;
  saveError: string;
  onSave: (values: CollectionInput) => void;
  onClose: () => void;
}

export function CollectionForm({ mixes, collections, collection, busy, saveError, onSave, onClose }: CollectionFormProps) {
  const [name, setName] = useState(collection?.name || "");
  const [selectedIds, setSelectedIds] = useState<string[]>(collection?.mixIds || []);
  const [error, setError] = useState("");
  const selectedCount = selectedIds.filter((id) => mixes.some((mix) => mix.id === id)).length;

  function toggleMix(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((mixId) => mixId !== id) : [...current, id]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleanName = name.trim();
    if (!cleanName) return setError("Give your collection a name.");
    if (collections.some((saved) => saved.id !== collection?.id && saved.name.toLowerCase() === cleanName.toLowerCase())) {
      return setError("A collection with that name already exists.");
    }
    onSave({ id: collection?.id, name: cleanName, mixIds: selectedIds.filter((id) => mixes.some((mix) => mix.id === id)) });
  }

  return (
    <Modal onClose={onClose} labelledBy="collection-form-title" className="collection-modal">
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
            <span>{selectedCount} selected</span>
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
          {(error || saveError) && <div className="form-error" role="alert">{error || saveError}</div>}
        </div>
        <div className="modal-footer">
          <span><span className="local-lock">◈</span> Mixes stay in your archive</span>
          <div>
            <button className="cancel-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {busy ? "Saving…" : collection ? "Save collection" : "Create collection"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
