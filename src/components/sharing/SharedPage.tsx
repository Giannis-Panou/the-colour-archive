import { Layers3, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { MixInput, SharedLinkState } from "../../types";
import { sharedMixes } from "../../lib/sharing";
import { MixSwatch } from "../mixes/MixSwatch";
import { PaintList } from "../mixes/PaintList";

function SharedMixCard({ mix }: { mix: MixInput }) {
  return (
    <article className="shared-mix-card">
      <MixSwatch mix={mix} className="shared-mix-image" />
      <div className="mix-card-body">
        <PaintList mix={mix} />
        {mix.notes && <p className="shared-mix-notes">{mix.notes}</p>}
      </div>
    </article>
  );
}

interface SharedPageProps {
  state: NonNullable<SharedLinkState>;
  notice: string;
  error: string;
  /** Saves the recipe to the visitor's archive. Resolves true when it worked. */
  onSave: () => Promise<boolean>;
}

/** What someone sees when they open a share link. */
export function SharedPage({ state, notice, error, onSave }: SharedPageProps) {
  const [saved, setSaved] = useState(false);
  const payload = state.status === "ready" ? state.payload : null;
  const isCollection = payload?.kind === "collection";
  const mixes = payload ? sharedMixes(payload) : [];
  const title = state.status === "loading" ? "Opening shared recipe"
    : state.status === "error" ? "This share link is unavailable"
      : payload?.kind === "collection" ? payload.name : payload?.mix.name;

  return (
    <main className="shared-page">
      <header className="shared-page-header">
        <Link className="shared-brand" to="/">
          <span className="brand-mark"><Layers3 size={21} strokeWidth={2.2} /></span>
          <span className="brand-name">the colour<br />archive</span>
        </Link>
        <span className="shared-label">SHARED PAINT RECIPE</span>
      </header>
      <section className="shared-page-content">
        <span className="eyebrow"><span className="eyebrow-line" /> {state.status === "loading" ? "SHARED PAINT RECIPE" : isCollection ? "A COLLECTION TO EXPLORE" : "A COLOUR MIX TO TRY"}</span>
        <h1>{title}{state.status === "loading" ? "…" : <span className="heading-period">.</span>}</h1>
        {state.status === "loading" && (
          <div className="archive-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Loading the recipe…</span></div>
        )}
        {state.status === "error" && <p className="shared-intro" role="alert">{state.message}</p>}
        {payload && (
          <>
            <p className="shared-intro">A snapshot from The Colour Archive. Save the recipe to your own browser to keep it handy.</p>
            <div className="shared-mix-grid">
              {mixes.map((mix, index) => <SharedMixCard key={`${mix.name}-${index}`} mix={mix} />)}
            </div>
            {!mixes.length && <p className="shared-intro">This collection doesn’t contain any mixes yet.</p>}
            {error && <p className="error-banner" role="alert">{error}</p>}
            {notice && <p className="success-banner" role="status">{notice}</p>}
            <button className="primary-button shared-home-link" disabled={saved} onClick={async () => setSaved(await onSave())}>
              {saved ? "Saved to my archive" : isCollection ? "Save collection to my archive" : "Save mix to my archive"}
            </button>
          </>
        )}
        <Link className="shared-archive-link" to="/">Open my archive</Link>
      </section>
    </main>
  );
}
