import { ArrowLeft, Camera, ImagePlus, LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import type { Mix, ProjectInput, ProjectPhoto } from "../types";
import type { ArchiveApi } from "../hooks/useArchive";
import type { PaintShelf } from "../lib/paints";
import { preparePhoto } from "../lib/images";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { PageBanners, PageHeading } from "../components/PageHeading";
import { PhotoDialog } from "../components/projects/PhotoDialog";
import { ProjectForm } from "../components/projects/ProjectForm";
import { RecipeCard } from "../components/recipes/RecipeCard";

/** Enough for a project's story without filling browser storage. */
export const MAX_PROJECT_PHOTOS = 12;

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

interface ProjectPageProps {
  archive: ArchiveApi;
  shelf: PaintShelf;
  errors: string[];
  notice: string;
  showNotice: (message: string) => void;
  onViewMix: (mix: Mix) => void;
}

type Dialog = null | { type: "edit" } | { type: "delete" } | { type: "addPhoto"; image: string } | { type: "viewPhoto"; photo: ProjectPhoto } | { type: "deletePhoto"; photo: ProjectPhoto };

/** One project: its recipes, its mixes and its progress photos. */
export function ProjectPage({ archive, shelf, errors, notice, showNotice, onViewMix }: ProjectPageProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [photoError, setPhotoError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const project = archive.projects.find((item) => item.id === projectId);
  const mixesById = useMemo(() => new Map(archive.mixes.map((mix) => [mix.id, mix])), [archive.mixes]);
  const close = () => { if (!archive.busy) setDialog(null); };

  if (archive.loading) {
    return <div className="archive-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Loading your project…</span></div>;
  }
  if (!project) return <Navigate to="/projects" replace />;

  const recipes = project.recipeIds.flatMap((id) => archive.recipes.find((recipe) => recipe.id === id) ?? []);
  const mixes = project.mixIds.flatMap((id) => mixesById.get(id) ?? []);
  const dialogError = archive.kind === "cloud" ? archive.error : "";
  const full = project.photos.length >= MAX_PROJECT_PHOTOS;

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const image = await preparePhoto(file);
      setPhotoError("");
      archive.setError("");
      setDialog({ type: "addPhoto", image });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "The photo could not be read. Please try another image.");
    }
  }

  async function savePhoto(caption: string) {
    if (dialog?.type !== "addPhoto" || !project) return;
    if (await archive.addProjectPhoto(project, dialog.image, caption)) {
      setDialog(null);
      showNotice("Photo added.");
    }
  }

  async function deletePhoto() {
    if (dialog?.type !== "deletePhoto" || !project) return;
    if (await archive.removeProjectPhoto(project, dialog.photo.id)) {
      setDialog(null);
      showNotice("Photo removed.");
    }
  }

  async function save(values: ProjectInput) {
    if (!project) return;
    if (await archive.saveProject(values, project)) {
      setDialog(null);
      showNotice("Project updated.");
    }
  }

  async function remove() {
    if (!project) return;
    if (await archive.deleteProject(project)) {
      showNotice(`“${project.name}” was deleted.`);
      navigate("/projects");
    }
  }

  return (
    <>
      <Link className="back-link" to="/projects"><ArrowLeft size={15} /> All projects</Link>
      <PageHeading
        eyebrow="PROJECT"
        title={project.name}
        subtitle={project.notes || `Started ${dateFormat.format(new Date(project.createdAt))}.`}
        action={(
          <div className="heading-actions">
            <button className="sort-button" onClick={() => { archive.setError(""); setDialog({ type: "edit" }); }}><Pencil size={15} /> Edit project</button>
            <button className="sort-button danger" onClick={() => setDialog({ type: "delete" })}><Trash2 size={15} /> Delete</button>
          </div>
        )}
      />

      <PageBanners errors={[...errors, photoError]} notice={notice} />

      <section className="collection-section project-section">
        <div className="section-title-row">
          <div>
            <h2>Progress photos <span className="mix-total">{project.photos.length}</span></h2>
            <p>{full ? `A project holds up to ${MAX_PROJECT_PHOTOS} photos. Remove one to add another.` : "From bare plastic to finished model."}</p>
          </div>
          <div className="collection-controls">
            <button className="sort-button" onClick={() => fileInput.current?.click()} disabled={full || archive.busy}><ImagePlus size={15} /> Add photo</button>
            <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={choosePhoto} tabIndex={-1} aria-hidden="true" />
          </div>
        </div>
        {project.photos.length ? (
          <div className="photo-grid">
            {project.photos.map((photo) => (
              <figure className="progress-photo" key={photo.id}>
                <button className="photo-open" onClick={() => setDialog({ type: "viewPhoto", photo })} aria-label={`View photo${photo.caption ? `: ${photo.caption}` : ""}`}>
                  {photo.image ? <img src={photo.image} alt="" /> : <Camera size={20} />}
                </button>
                <figcaption>
                  <span>{photo.caption || "Untitled photo"}</span>
                  <time dateTime={photo.addedAt}>{dateFormat.format(new Date(photo.addedAt))}</time>
                </figcaption>
                <button className="photo-delete delete-button" onClick={() => setDialog({ type: "deletePhoto", photo })} aria-label={`Remove photo${photo.caption ? ` ${photo.caption}` : ""}`} title="Remove photo"><Trash2 size={14} /></button>
              </figure>
            ))}
          </div>
        ) : (
          <button className="photo-empty upload-zone" onClick={() => fileInput.current?.click()}>
            <span className="upload-icon"><Camera size={18} /></span>
            <span className="upload-copy"><strong>Add your first progress photo</strong><small>JPG, PNG or WebP · up to 8 MB, resized</small></span>
          </button>
        )}
      </section>

      <section className="collection-section project-section">
        <div className="section-title-row">
          <div><h2>Recipes <span className="mix-total">{recipes.length}</span></h2><p>The schemes this project is painted with.</p></div>
        </div>
        {recipes.length ? (
          <div className="recipe-grid">
            {recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} mixesById={mixesById} shelf={shelf} onViewMix={onViewMix} />)}
          </div>
        ) : (
          <p className="section-empty">No recipes linked yet. <button className="text-button" onClick={() => setDialog({ type: "edit" })}>Choose recipes</button></p>
        )}
      </section>

      <section className="collection-section project-section">
        <div className="section-title-row">
          <div><h2>Mixes <span className="mix-total">{mixes.length}</span></h2><p>Other colours from your archive.</p></div>
        </div>
        {mixes.length ? (
          <ul className="mix-chips">
            {mixes.map((mix) => (
              <li key={mix.id}>
                <button className="mix-chip" onClick={() => onViewMix(mix)} aria-label={`View ${mix.name}`}>
                  <span className="collection-mix-swatch" style={{ backgroundColor: mix.color }} /> <strong>{mix.name}</strong> <small>{mix.color.toUpperCase()}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-empty">No mixes linked yet. <button className="text-button" onClick={() => setDialog({ type: "edit" })}>Choose mixes</button></p>
        )}
      </section>

      {dialog?.type === "edit" && (
        <ProjectForm project={project} recipes={archive.recipes} mixes={archive.mixes} busy={archive.busy} saveError={dialogError} onSave={save} onClose={close} />
      )}
      {dialog?.type === "addPhoto" && (
        <PhotoDialog image={dialog.image} busy={archive.busy} saveError={archive.error} onSave={savePhoto} onClose={close} />
      )}
      {dialog?.type === "viewPhoto" && (
        <Modal onClose={close} labelledBy="photo-viewer-title" className="photo-viewer">
          <div className="photo-viewer-header">
            <h2 id="photo-viewer-title">{dialog.photo.caption || "Progress photo"}</h2>
            <button className="modal-close" onClick={close} aria-label="Close photo"><X size={19} /></button>
          </div>
          <img src={dialog.photo.image} alt={dialog.photo.caption || `Progress photo of ${project.name}`} />
        </Modal>
      )}
      {dialog?.type === "deletePhoto" && (
        <ConfirmDialog
          id="delete-photo"
          icon={<Trash2 size={18} />}
          title="Remove this photo?"
          description={<>{dialog.photo.caption ? <strong>{dialog.photo.caption}</strong> : "This photo"} will be removed from the project.</>}
          onClose={close}
          actions={(
            <>
              <button autoFocus onClick={close} disabled={archive.busy}>Cancel</button>
              <button className="confirm-delete" onClick={deletePhoto} disabled={archive.busy}>{archive.busy ? "Removing…" : "Remove photo"}</button>
            </>
          )}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          id="delete-project"
          icon={<Trash2 size={18} />}
          title="Delete this project?"
          description={<><strong>{project.name}</strong> and its photos will be removed. Its recipes and mixes stay in your archive.</>}
          onClose={close}
          actions={(
            <>
              <button autoFocus onClick={close} disabled={archive.busy}>Cancel</button>
              <button className="confirm-delete" onClick={remove} disabled={archive.busy}>{archive.busy ? "Deleting…" : "Delete project"}</button>
            </>
          )}
        />
      )}
    </>
  );
}
