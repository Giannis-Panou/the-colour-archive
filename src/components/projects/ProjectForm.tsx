import { Check, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Mix, Project, ProjectInput, Recipe } from "../../types";
import { Modal } from "../Modal";

interface ProjectFormProps {
  project: Project | null;
  recipes: Recipe[];
  mixes: Mix[];
  busy: boolean;
  saveError: string;
  onSave: (values: ProjectInput) => void;
  onClose: () => void;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

/** A model or army: its name, notes, and the recipes and mixes it's painted with. */
export function ProjectForm({ project, recipes, mixes, busy, saveError, onSave, onClose }: ProjectFormProps) {
  const [name, setName] = useState(project?.name || "");
  const [notes, setNotes] = useState(project?.notes || "");
  const [recipeIds, setRecipeIds] = useState<string[]>(project?.recipeIds || []);
  const [mixIds, setMixIds] = useState<string[]>(project?.mixIds || []);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Give your project a name.");
    onSave({
      name: name.trim(),
      notes: notes.trim(),
      recipeIds: recipeIds.filter((id) => recipes.some((recipe) => recipe.id === id)),
      mixIds: mixIds.filter((id) => mixes.some((mix) => mix.id === id)),
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="project-form-title" className="collection-modal project-modal">
      <div className="modal-header">
        <div>
          <span className="modal-eyebrow">{project ? "UPDATE YOUR PROJECT" : "ON THE PAINTING TABLE"}</span>
          <h2 id="project-form-title">{project ? "Edit project" : "A new project"}<span>.</span></h2>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close project form"><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="collection-form-content">
          <label className="field-label">Project name
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ultramarines strike force" autoFocus maxLength={70} />
          </label>
          <label className="field-label"><span className="field-label-text">Notes <span className="optional-label">OPTIONAL</span></span>
            <textarea className="text-input notes-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Models in the project, deadlines, ideas…" maxLength={500} />
          </label>

          <div className="collection-picker-heading">
            <div><strong>Recipes used</strong><span>The schemes this project is painted with.</span></div>
            <span>{recipeIds.length} selected</span>
          </div>
          {recipes.length ? (
            <div className="collection-mix-list short">
              {recipes.map((recipe) => {
                const checked = recipeIds.includes(recipe.id);
                return (
                  <label className={`collection-mix-option ${checked ? "selected" : ""}`} key={recipe.id}>
                    <input type="checkbox" checked={checked} onChange={() => setRecipeIds((current) => toggle(current, recipe.id))} />
                    <span className="collection-mix-copy"><strong>{recipe.name}</strong><small>{recipe.steps.map((step) => step.role).join(" → ")}</small></span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="picker-empty">No recipes yet. You can add them to the project later.</p>
          )}

          <div className="collection-picker-heading">
            <div><strong>Mixes used</strong><span>Any other colours from your archive.</span></div>
            <span>{mixIds.length} selected</span>
          </div>
          {mixes.length ? (
            <div className="collection-mix-list short">
              {mixes.map((mix) => {
                const checked = mixIds.includes(mix.id);
                return (
                  <label className={`collection-mix-option ${checked ? "selected" : ""}`} key={mix.id}>
                    <input type="checkbox" checked={checked} onChange={() => setMixIds((current) => toggle(current, mix.id))} />
                    <span className="collection-mix-swatch" style={{ backgroundColor: mix.color }} />
                    <span className="collection-mix-copy"><strong>{mix.name}</strong><small>{mix.paints.map((paint) => paint.name).filter(Boolean).join(" · ") || "No paints listed"}</small></span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="picker-empty">No mixes yet.</p>
          )}
          {(error || saveError) && <div className="form-error" role="alert">{error || saveError}</div>}
        </div>
        <div className="modal-footer">
          <span><span className="local-lock">◈</span> Add progress photos on the project page</span>
          <div>
            <button className="cancel-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {busy ? "Saving…" : project ? "Save project" : "Create project"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
