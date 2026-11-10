import { Camera, Hammer, LoaderCircle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Mix, Project, ProjectInput, Recipe } from "../types";
import type { ArchiveApi } from "../hooks/useArchive";
import { PageBanners, PageHeading } from "../components/PageHeading";
import { ProjectForm } from "../components/projects/ProjectForm";
import { plural } from "../lib/validation";

/** The colours a project uses, for its card when it has no photo yet. */
function projectColors(project: Project, recipesById: Map<string, Recipe>, mixesById: Map<string, Mix>): string[] {
  const colors = [
    ...project.recipeIds.flatMap((id) => recipesById.get(id)?.steps.flatMap((step) => (step.mixId ? mixesById.get(step.mixId)?.color ?? [] : [])) ?? []),
    ...project.mixIds.flatMap((id) => mixesById.get(id)?.color ?? []),
  ];
  return [...new Set(colors)].slice(0, 8);
}

interface ProjectsPageProps {
  archive: ArchiveApi;
  errors: string[];
  notice: string;
  showNotice: (message: string) => void;
}

/** Models and armies on the painting table, each with its recipes and progress photos. */
export function ProjectsPage({ archive, errors, notice, showNotice }: ProjectsPageProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const recipesById = useMemo(() => new Map(archive.recipes.map((recipe) => [recipe.id, recipe])), [archive.recipes]);
  const mixesById = useMemo(() => new Map(archive.mixes.map((mix) => [mix.id, mix])), [archive.mixes]);

  async function create(values: ProjectInput) {
    const saved = await archive.saveProject(values, null);
    if (!saved) return;
    setCreating(false);
    showNotice("Project created.");
    navigate(`/projects/${saved.id}`);
  }

  function openForm() {
    archive.setError("");
    setCreating(true);
  }

  return (
    <>
      <PageHeading
        eyebrow="ON THE PAINTING TABLE"
        title="Projects"
        subtitle="Models and armies, with the recipes they use and photos of how they're coming along."
        action={<button className="primary-button" onClick={openForm} disabled={archive.loading}><Plus size={18} strokeWidth={2.4} /> New project</button>}
      />

      <section className="collection-section">
        <div className="section-title-row">
          <div>
            <h2>Your projects <span className="mix-total">{archive.projects.length}</span></h2>
            <p>Open one to add progress photos.</p>
          </div>
        </div>

        <PageBanners errors={errors} notice={notice} />

        {archive.loading ? (
          <div className="archive-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Loading your projects…</span></div>
        ) : archive.projects.length > 0 ? (
          <div className="project-grid">
            {archive.projects.map((project) => {
              const cover = project.photos.at(-1);
              const colors = projectColors(project, recipesById, mixesById);
              const recipes = project.recipeIds.filter((id) => recipesById.has(id)).length;
              const mixes = project.mixIds.filter((id) => mixesById.has(id)).length;
              return (
                <Link className="project-card" to={`/projects/${project.id}`} key={project.id}>
                  <span className="project-cover">
                    {cover?.image ? <img src={cover.image} alt="" /> : (
                      <span className="project-colors" aria-hidden="true">
                        {colors.length ? colors.map((color) => <i key={color} style={{ backgroundColor: color }} />) : <Hammer size={26} />}
                      </span>
                    )}
                    {project.photos.length > 0 && <span className="photo-count"><Camera size={12} /> {project.photos.length}</span>}
                  </span>
                  <span className="project-card-body">
                    <strong>{project.name}</strong>
                    <small>{[plural(recipes, "recipe"), plural(mixes, "mix", "mixes")].join(" · ")}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-search page-empty">
            <Hammer size={23} />
            <h3>Start your first project</h3>
            <p>Group the recipes for a model or an army, and keep photos of each stage as you paint.</p>
            <button className="primary-button" onClick={openForm}><Plus size={16} /> New project</button>
          </div>
        )}
      </section>

      {creating && (
        <ProjectForm
          project={null}
          recipes={archive.recipes}
          mixes={archive.mixes}
          busy={archive.busy}
          saveError={archive.kind === "cloud" ? archive.error : ""}
          onSave={create}
          onClose={() => { if (!archive.busy) setCreating(false); }}
        />
      )}
    </>
  );
}
