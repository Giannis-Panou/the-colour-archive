import { Check, LoaderCircle, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ShareLinkResult, ShareTarget } from "../../types";
import { Modal } from "../Modal";

type State = { status: "creating" } | { status: "error"; message: string } | ({ status: "ready" } & ShareLinkResult);

interface ShareDialogProps {
  target: ShareTarget;
  signedIn: boolean;
  onCreate: (target: ShareTarget) => Promise<ShareLinkResult>;
  onSignIn: () => void;
  onClose: () => void;
}

/** Creates a share link, then offers Copy and the system share sheet. */
export function ShareDialog({ target, signedIn, onCreate, onSignIn, onClose }: ShareDialogProps) {
  const [state, setState] = useState<State>({ status: "creating" });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const request = useRef<Promise<ShareLinkResult> | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const photoCount = target.mixes.filter((mix) => mix.image).length;
  const canShare = typeof navigator.share === "function";

  // One request per dialog, even when React runs effects twice in development.
  useEffect(() => {
    if (!request.current) request.current = onCreate(target);
    let cancelled = false;
    request.current.then(
      (result) => { if (!cancelled) setState({ status: "ready", ...result }); },
      (error: unknown) => { if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "The link couldn't be created. Try again." }); },
    );
    return () => { cancelled = true; };
  }, [onCreate, target]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch (error) {
      console.error("Could not copy the share link:", error);
      linkInput.current?.select();
      setCopyState("manual");
    }
  }

  async function shareNatively(url: string) {
    try {
      await navigator.share({ title: target.title, text: `${target.title} · The Colour Archive`, url });
    } catch (error) {
      if ((error as Error).name !== "AbortError") console.error("Could not open the share sheet:", error);
    }
  }

  const summary = `${target.mixes.length} ${target.mixes.length === 1 ? "mix" : "mixes"}${photoCount ? ` · ${photoCount} ${photoCount === 1 ? "photo" : "photos"}` : ""}`;

  return (
    <Modal onClose={onClose} labelledBy="share-title" describedBy="share-description" className="collection-delete-dialog sign-in-dialog share-dialog" backdropClassName="collection-delete-backdrop">
      <button className="modal-close sign-in-close" onClick={onClose} aria-label="Close sharing"><X size={17} /></button>
      <span className="confirm-icon import-icon"><Share2 size={18} /></span>
      <h2 id="share-title">Share {target.kind === "mix" ? "this mix" : "this collection"}</h2>
      <p id="share-description">Anyone with the link can see the recipe and save a copy to their own archive.</p>

      <div className="share-preview" aria-label={`${target.title}: ${summary}`}>
        <span className="share-swatches" aria-hidden="true">
          {target.mixes.slice(0, 6).map((mix, index) => <i key={`${mix.color}-${index}`} style={{ backgroundColor: mix.color }} />)}
        </span>
        <span className="share-preview-copy"><strong>{target.title}</strong><small>{summary}</small></span>
      </div>

      {state.status === "creating" && <div className="share-creating" role="status"><LoaderCircle size={18} className="spin" /> Creating your link…</div>}
      {state.status === "error" && <div className="form-error" role="alert">{state.message}</div>}
      {state.status === "ready" && (
        <>
          <label className="field-label share-link-field" htmlFor="share-link">
            <span className="field-label-text">{state.short ? "Short link" : "Link"}</span>
            <span className="share-link-row">
              <input id="share-link" ref={linkInput} className="text-input" readOnly value={state.url} onFocus={(event) => event.target.select()} />
              <button type="button" className={`share-copy ${copyState === "copied" ? "copied" : ""}`} onClick={() => copyLink(state.url)} aria-live="polite">
                {copyState === "copied" ? <><Check size={15} /> Copied</> : "Copy"}
              </button>
            </span>
          </label>
          <ul className="share-notes">
            {copyState === "manual" && <li className="share-note-warn">Your browser blocked copying. The link is selected: press Ctrl+C (or ⌘C) to copy it.</li>}
            {state.short
              ? <li>A snapshot: changes you make later won’t change what this link shows.</li>
              : <li>The whole recipe travels inside this link, so it works without an account.</li>}
            {state.photosIncluded > 0 && <li>Includes {state.photosIncluded} {state.photosIncluded === 1 ? "photo" : "photos"}.</li>}
            {state.photosOmitted > 0 && <li>{state.photosOmitted} {state.photosOmitted === 1 ? "photo was" : "photos were"} left out{state.short ? "." : " to keep the link short."}</li>}
            {!signedIn && <li><button type="button" className="text-button" onClick={onSignIn}>Sign in</button> to get short links that include photos.</li>}
          </ul>
        </>
      )}

      <div className="confirm-actions">
        <button type="button" onClick={onClose}>Done</button>
        {state.status === "ready" && (canShare
          ? <button type="button" className="confirm-primary" onClick={() => shareNatively(state.url)}><Share2 size={15} /> Share…</button>
          : <button type="button" className="confirm-primary" onClick={() => copyLink(state.url)}>{copyState === "copied" ? "Copied" : "Copy link"}</button>)}
      </div>
    </Modal>
  );
}
