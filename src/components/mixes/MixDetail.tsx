import { BookOpen, Folder, Hammer, Pencil, Share2, Star, X } from "lucide-react";
import { Link } from "react-router";
import type { Collection, Mix, Project, Recipe } from "../../types";
import type { PaintShelf } from "../../lib/paints";
import { Modal } from "../Modal";
import { MixSwatch } from "./MixSwatch";
import { PaintList } from "./PaintList";

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });

interface MixDetailProps {
  mix: Mix;
  shelf: PaintShelf;
  collections: Collection[];
  recipes: Recipe[];
  projects: Project[];
  busy: boolean;
  onEdit: (mix: Mix) => void;
  onShare: (mix: Mix) => void;
  onToggleFavorite: (mix: Mix) => void;
  onClose: () => void;
}

/** A mix at a glance: an enlarged card with the full recipe, notes, and where the mix is used. */
export function MixDetail({ mix, shelf, collections, recipes, projects, busy, onEdit, onShare, onToggleFavorite, onClose }: MixDetailProps) {
  const totalDrops = mix.paints.reduce((total, paint) => total + (Number(paint.drops) || 0), 0);
  const inCollections = collections.filter((collection) => collection.mixIds.includes(mix.id));
  const inRecipes = recipes.filter((recipe) => recipe.steps.some((step) => step.mixId === mix.id));
  const inProjects = projects.filter((project) => project.mixIds.includes(mix.id) || project.recipeIds.some((id) => inRecipes.some((recipe) => recipe.id === id)));
  const favoriteLabel = mix.favorite ? "Remove from favourites" : "Add to favourites";
  const uses = [
    ...inCollections.map((collection) => ({ key: `c-${collection.id}`, icon: Folder, label: collection.name, to: `/collections/${collection.id}` })),
    ...inRecipes.map((recipe) => ({ key: `r-${recipe.id}`, icon: BookOpen, label: recipe.name, to: "/recipes" })),
    ...inProjects.map((project) => ({ key: `p-${project.id}`, icon: Hammer, label: project.name, to: `/projects/${project.id}` })),
  ];

  return (
    <Modal onClose={onClose} labelledBy="mix-detail-title" className="mix-detail">
      <MixSwatch mix={mix} className="mix-image mix-detail-image">
        <button className="modal-close mix-detail-close" onClick={onClose} aria-label="Close mix details"><X size={19} /></button>
      </MixSwatch>
      <div className="mix-detail-body">
        <div className="mix-detail-heading">
          <span className="modal-eyebrow">{mix.favorite ? "★ A FAVOURITE MIX" : "COLOUR MIX"}</span>
          <h2 id="mix-detail-title">{mix.name}<span>.</span></h2>
          <p>
            <span className="mix-detail-hex">{mix.color.toUpperCase()}</span>
            {" · "}{mix.paints.length} {mix.paints.length === 1 ? "paint" : "paints"}
            {" · "}{totalDrops} {totalDrops === 1 ? "drop" : "drops"}
            {" · "}Saved <time dateTime={mix.createdAt}>{dateFormat.format(new Date(mix.createdAt))}</time>
          </p>
        </div>

        <div className="form-section-heading"><span>THE RECIPE</span><span className="ingredient-hint">Paint &amp; drop count</span></div>
        <div className="mix-detail-paints">
          <PaintList mix={mix} shelf={shelf} />
        </div>

        {mix.notes && (
          <>
            <div className="form-section-heading"><span>NOTES</span></div>
            <p className="mix-detail-notes">{mix.notes}</p>
          </>
        )}

        {uses.length > 0 && (
          <>
            <div className="form-section-heading"><span>USED IN</span></div>
            <ul className="mix-detail-uses">
              {uses.map(({ key, icon: Icon, label, to }) => (
                <li key={key}><Link to={to} onClick={onClose}><Icon size={14} /> {label}</Link></li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="modal-footer mix-detail-footer">
        <button className={`sort-button favorites-toggle ${mix.favorite ? "on" : ""}`} onClick={() => onToggleFavorite(mix)} aria-pressed={Boolean(mix.favorite)} disabled={busy}>
          <Star size={15} fill={mix.favorite ? "currentColor" : "none"} /> {favoriteLabel}
        </button>
        <div>
          <button className="cancel-button" onClick={() => onShare(mix)}><Share2 size={15} /> Share</button>
          <button className="primary-button save-button" onClick={() => onEdit(mix)}><Pencil size={15} /> Edit mix</button>
        </div>
      </div>
    </Modal>
  );
}
