import { BookOpen, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Recipe, RecipeInput } from "../types";
import type { ArchiveApi } from "../hooks/useArchive";
import type { PaintShelf } from "../lib/paints";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageBanners, PageHeading } from "../components/PageHeading";
import { RecipeCard } from "../components/recipes/RecipeCard";
import { RecipeForm } from "../components/recipes/RecipeForm";

interface RecipesPageProps {
  archive: ArchiveApi;
  shelf: PaintShelf;
  errors: string[];
  notice: string;
  showNotice: (message: string) => void;
}

/** Paint schemes: ordered steps from primer to varnish, each using a mix or a single paint. */
export function RecipesPage({ archive, shelf, errors, notice, showNotice }: RecipesPageProps) {
  const [editing, setEditing] = useState<{ recipe: Recipe | null } | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);
  const [query, setQuery] = useState("");
  const mixesById = useMemo(() => new Map(archive.mixes.map((mix) => [mix.id, mix])), [archive.mixes]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return archive.recipes;
    return archive.recipes.filter((recipe) => [
      recipe.name, recipe.notes,
      ...recipe.steps.map((step) => `${step.role} ${step.paint} ${step.note} ${step.mixId ? mixesById.get(step.mixId)?.name ?? "" : ""}`),
    ].join(" ").toLowerCase().includes(search));
  }, [archive.recipes, query, mixesById]);

  function openForm(recipe: Recipe | null) {
    archive.setError("");
    setEditing({ recipe });
  }

  async function save(values: RecipeInput) {
    if (!editing) return;
    const saved = await archive.saveRecipe(values, editing.recipe);
    if (!saved) return;
    setEditing(null);
    showNotice(editing.recipe ? "Recipe updated." : "Recipe saved.");
  }

  async function remove() {
    if (!deleting) return;
    if (!await archive.deleteRecipe(deleting.id)) return;
    showNotice(`“${deleting.name}” was deleted.`);
    setDeleting(null);
  }

  return (
    <>
      <PageHeading
        eyebrow="FROM PRIMER TO VARNISH"
        title="Recipes"
        subtitle="Whole paint schemes, step by step. Use your mixes or single paints."
        action={<button className="primary-button" onClick={() => openForm(null)} disabled={archive.loading}><Plus size={18} strokeWidth={2.4} /> New recipe</button>}
      />

      <section className="collection-section">
        <div className="section-title-row">
          <div>
            <h2>Your recipes <span className="mix-total">{archive.recipes.length}</span></h2>
            <p>Schemes you can paint again and again.</p>
          </div>
          {archive.recipes.length > 0 && (
            <div className="collection-controls">
              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes..." aria-label="Search recipes" />
                {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
              </label>
            </div>
          )}
        </div>

        <PageBanners errors={errors} notice={notice} />

        {archive.loading ? (
          <div className="archive-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Loading your recipes…</span></div>
        ) : visible.length > 0 ? (
          <div className="recipe-grid">
            {visible.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} mixesById={mixesById} shelf={shelf} onEdit={openForm} onDelete={setDeleting} />)}
          </div>
        ) : archive.recipes.length > 0 ? (
          <div className="empty-search">
            <Search size={22} />
            <h3>No recipes found</h3>
            <p>Try a different name, paint or technique.</p>
            <button className="text-button" onClick={() => setQuery("")}>Clear search</button>
          </div>
        ) : (
          <div className="empty-search page-empty">
            <BookOpen size={23} />
            <h3>Write down your first scheme</h3>
            <p>Base, shade, layer, highlight: save the steps that worked so the next model matches the last.</p>
            <button className="primary-button" onClick={() => openForm(null)}><Plus size={16} /> New recipe</button>
          </div>
        )}
      </section>

      {editing && (
        <RecipeForm
          recipe={editing.recipe}
          mixes={archive.mixes}
          ownedPaints={archive.paints}
          busy={archive.busy}
          saveError={archive.kind === "cloud" ? archive.error : ""}
          onSave={save}
          onClose={() => { if (!archive.busy) setEditing(null); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          id="delete-recipe"
          icon={<Trash2 size={18} />}
          title="Delete this recipe?"
          description={<><strong>{deleting.name}</strong> will be removed. The mixes it uses stay in your archive.</>}
          onClose={() => setDeleting(null)}
          actions={(
            <>
              <button autoFocus onClick={() => setDeleting(null)} disabled={archive.busy}>Cancel</button>
              <button className="confirm-delete" onClick={remove} disabled={archive.busy}>{archive.busy ? "Deleting…" : "Delete recipe"}</button>
            </>
          )}
        />
      )}
    </>
  );
}
