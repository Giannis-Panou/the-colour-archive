import { ArrowDown, ArrowUp, Check, ChevronDown, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Mix, OwnedPaint, Recipe, RecipeInput, RecipeStep } from "../../types";
import { Modal } from "../Modal";

const STEP_ROLES = ["Primer", "Base", "Wash", "Shade", "Layer", "Highlight", "Edge highlight", "Glaze", "Drybrush", "Basing", "Varnish", "Other"];
const SINGLE_PAINT = "__paint";
const STARTER_STEPS: RecipeStep[] = ["Base", "Shade", "Layer", "Highlight"].map((role) => ({ role, mixId: null, paint: "", note: "" }));

interface RecipeFormProps {
  recipe: Recipe | null;
  mixes: Mix[];
  ownedPaints: OwnedPaint[];
  busy: boolean;
  saveError: string;
  onSave: (values: RecipeInput) => void;
  onClose: () => void;
}

/** Name a scheme and list its steps in order, each using a saved mix or a single paint. */
export function RecipeForm({ recipe, mixes, ownedPaints, busy, saveError, onSave, onClose }: RecipeFormProps) {
  const [name, setName] = useState(recipe?.name || "");
  const [notes, setNotes] = useState(recipe?.notes || "");
  const [steps, setSteps] = useState<RecipeStep[]>(() => (recipe?.steps.length ? recipe.steps.map((step) => ({ ...step })) : STARTER_STEPS.map((step) => ({ ...step }))));
  const [error, setError] = useState("");
  const mixIds = new Set(mixes.map((mix) => mix.id));

  const updateStep = (index: number, change: Partial<RecipeStep>) => setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...change } : step)));
  const moveStep = (index: number, by: number) => setSteps((current) => {
    const next = [...current];
    const [step] = next.splice(index, 1);
    next.splice(index + by, 0, step);
    return next;
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    // A step needs a colour: a mix that still exists, or a paint name.
    const cleanSteps = steps
      .map((step) => ({ ...step, paint: step.mixId ? "" : step.paint.trim(), note: step.note.trim() }))
      .filter((step) => (step.mixId ? mixIds.has(step.mixId) : step.paint));
    if (!name.trim()) return setError("Give your recipe a name.");
    if (!cleanSteps.length) return setError("Add at least one step with a mix or a paint.");
    onSave({ name: name.trim(), notes: notes.trim(), steps: cleanSteps });
  }

  return (
    <Modal onClose={onClose} labelledBy="recipe-form-title" className="mix-modal recipe-modal">
      <div className="modal-header">
        <div><span className="modal-eyebrow">{recipe ? "UPDATE YOUR SCHEME" : "A STEP-BY-STEP SCHEME"}</span><h2 id="recipe-form-title">{recipe ? "Edit recipe" : "A new recipe"}<span>.</span></h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close recipe form"><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="form-scroll-area">
          <label className="field-label"><span className="field-label-text">What is it for?<span className="required-mark" aria-hidden="true">*</span></span>
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weathered bronze armour" autoFocus maxLength={70} />
          </label>

          <div className="form-section-heading"><span>THE STEPS</span><span className="ingredient-hint">In painting order</span></div>
          <ol className="step-editor">
            {steps.map((step, index) => (
              <li className="step-row" key={index}>
                <span className="ingredient-index">{String(index + 1).padStart(2, "0")}</span>
                <label className="ingredient-input step-role-field"><span className="sr-only">Step {index + 1} technique</span>
                  <select value={step.role} onChange={(event) => updateStep(index, { role: event.target.value })}>
                    {[...new Set([...STEP_ROLES, step.role])].map((role) => <option key={role}>{role}</option>)}
                  </select>
                  <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                </label>
                <label className="ingredient-input step-source-field"><span className="sr-only">Step {index + 1} colour</span>
                  <select value={step.mixId ?? SINGLE_PAINT} onChange={(event) => updateStep(index, event.target.value === SINGLE_PAINT ? { mixId: null } : { mixId: event.target.value, paint: "" })}>
                    <option value={SINGLE_PAINT}>A single paint…</option>
                    {mixes.length > 0 && (
                      <optgroup label="Your mixes">
                        {mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}
                      </optgroup>
                    )}
                    {step.mixId && !mixIds.has(step.mixId) && <option value={step.mixId}>A mix that was deleted</option>}
                  </select>
                  <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                </label>
                {!step.mixId && (
                  <label className="ingredient-input step-paint-field"><span className="sr-only">Step {index + 1} paint name</span>
                    <input value={step.paint} onChange={(event) => updateStep(index, { paint: event.target.value })} placeholder="Paint name" maxLength={50} list={ownedPaints.length ? "recipe-paint-names" : undefined} autoComplete="off" />
                  </label>
                )}
                <label className="ingredient-input step-note-field"><span className="sr-only">Step {index + 1} note</span>
                  <input value={step.note} onChange={(event) => updateStep(index, { note: event.target.value })} placeholder="Note, e.g. thin, two coats" maxLength={120} />
                </label>
                <span className="step-buttons">
                  <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`} title="Move up"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} aria-label={`Move step ${index + 1} down`} title="Move down"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))} disabled={steps.length === 1} aria-label={`Remove step ${index + 1}`} title="Remove step"><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
          {ownedPaints.length > 0 && (
            <datalist id="recipe-paint-names">
              {ownedPaints.map((paint) => <option key={paint.id} value={paint.name}>{paint.brand}</option>)}
            </datalist>
          )}
          <button className="add-paint-button" type="button" onClick={() => setSteps((current) => [...current, { role: "Layer", mixId: null, paint: "", note: "" }])} disabled={steps.length >= 30}>
            <Plus size={15} /> Add a step
          </button>

          <label className="field-label recipe-notes-field"><span className="field-label-text">Notes <span className="optional-label">OPTIONAL</span></span>
            <textarea className="text-input notes-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Brushes, drying times, what to watch out for…" maxLength={500} />
          </label>
          {(error || saveError) && <div className="form-error" role="alert">{error || saveError}</div>}
        </div>
        <div className="modal-footer">
          <span><span className="local-lock">◈</span> Steps can use your mixes or single paints</span>
          <div>
            <button className="cancel-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {busy ? "Saving…" : recipe ? "Save changes" : "Save recipe"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
