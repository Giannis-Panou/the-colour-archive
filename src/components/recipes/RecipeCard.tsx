import { Pencil, Trash2 } from "lucide-react";
import type { Mix, Recipe } from "../../types";
import type { PaintShelf } from "../../lib/paints";

interface RecipeCardProps {
  recipe: Recipe;
  mixesById: Map<string, Mix>;
  shelf: PaintShelf;
  onEdit?: (recipe: Recipe) => void;
  onDelete?: (recipe: Recipe) => void;
  /** Opens a step's mix. */
  onViewMix?: (mix: Mix) => void;
}

/** A recipe's steps in painting order, each with the colour it uses. */
export function RecipeCard({ recipe, mixesById, shelf, onEdit, onDelete, onViewMix }: RecipeCardProps) {
  return (
    <article className="recipe-card">
      <div className="recipe-strip" aria-hidden="true">
        {recipe.steps.map((step, index) => {
          const color = step.mixId ? mixesById.get(step.mixId)?.color : shelf.find("", step.paint)?.swatch;
          return <i key={index} style={color ? { backgroundColor: color } : undefined} />;
        })}
      </div>
      <div className="recipe-card-body">
        <div className="recipe-card-title">
          <h3>{recipe.name}</h3>
          <span className="paint-count">{recipe.steps.length} {recipe.steps.length === 1 ? "step" : "steps"}</span>
          {(onEdit || onDelete) && (
            <span className="recipe-card-actions">
              {onEdit && <button className="edit-button" onClick={() => onEdit(recipe)} aria-label={`Edit ${recipe.name}`} title={`Edit ${recipe.name}`}><Pencil size={15} /></button>}
              {onDelete && <button className="delete-button" onClick={() => onDelete(recipe)} aria-label={`Delete ${recipe.name}`} title={`Delete ${recipe.name}`}><Trash2 size={15} /></button>}
            </span>
          )}
        </div>
        {recipe.notes && <p className="recipe-notes">{recipe.notes}</p>}
        <ol className="recipe-steps">
          {recipe.steps.map((step, index) => {
            const mix = step.mixId ? mixesById.get(step.mixId) : undefined;
            const owned = !step.mixId ? shelf.find("", step.paint) : undefined;
            const color = mix?.color ?? owned?.swatch;
            const label = step.mixId ? mix?.name ?? "A mix that was deleted" : step.paint;
            const missing = !step.mixId && !shelf.isEmpty && !shelf.owns("", step.paint);
            return (
              <li className="recipe-step" key={index}>
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <span className={`step-swatch ${color ? "" : "unknown"}`} style={color ? { backgroundColor: color } : undefined} aria-hidden="true" />
                <span className="step-copy">
                  <span className="step-role">{step.role}</span>
                  <strong className={step.mixId && !mix ? "step-gone" : ""}>
                    {mix && onViewMix
                      ? <button className="step-mix-link" onClick={() => onViewMix(mix)} title={`View ${mix.name}`}>{label}</button>
                      : label}
                    {mix && <span className="step-kind">mix</span>}
                    {missing && <span className="missing-paint" title="Not on My paints">not owned</span>}
                  </strong>
                  {step.note && <small>{step.note}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}
