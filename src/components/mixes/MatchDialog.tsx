import { ImagePlus, Pipette, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Mix } from "../../types";
import { colorDifference, describeDifference } from "../../lib/color";
import { preparePhoto } from "../../lib/images";
import { Modal } from "../Modal";
import { ColorSampler } from "./ColorSampler";

const RESULTS = 6;

interface MatchDialogProps {
  mixes: Mix[];
  /** Opens a matched mix's details on top of this dialog. */
  onOpenMix: (mix: Mix) => void;
  onClose: () => void;
}

/**
 * Pick a colour (from a reference photo or the colour picker) and see the archive's closest mixes,
 * ranked by CIEDE2000, which measures how different two colours look rather than how far apart
 * their numbers are.
 */
export function MatchDialog({ mixes, onOpenMix, onClose }: MatchDialogProps) {
  const [target, setTarget] = useState("#8a6f4d");
  const [picked, setPicked] = useState(false);
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const showError = useCallback((message: string) => setError(message), []);
  const pick = useCallback((color: string) => { setTarget(color); setPicked(true); }, []);

  const matches = useMemo(() => mixes
    .map((mix) => ({ mix, difference: colorDifference(target, mix.color) }))
    .sort((a, b) => a.difference - b.difference)
    .slice(0, RESULTS), [mixes, target]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      setPhoto(await preparePhoto(file));
      setError("");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "The photo could not be read. Please try another image.");
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="match-title" className="mix-modal match-modal">
      <div className="modal-header">
        <div><span className="modal-eyebrow">FIND IT IN YOUR ARCHIVE</span><h2 id="match-title">Match a colour<span>.</span></h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close colour matching"><X size={19} /></button>
      </div>
      <div className="form-scroll-area match-content">
        <p className="match-intro">Pick a colour from a reference photo, or choose one, to see which of your mixes come closest.</p>
        <div className="match-target-row">
          <div className="field-label color-field-label">Colour to match
            <div className="color-input-wrap">
              <input type="color" value={target} onChange={(event) => pick(event.target.value)} aria-label="Colour to match" />
              <span>{target.toUpperCase()}</span>
            </div>
          </div>
          <button className="sort-button" type="button" onClick={() => fileInput.current?.click()}>
            <ImagePlus size={15} /> {photo ? "Use another photo" : "Use a reference photo"}
          </button>
          <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={choosePhoto} tabIndex={-1} aria-hidden="true" />
        </div>
        {photo && (
          <div className="match-photo">
            <ColorSampler image={photo} onPick={pick} onError={showError} />
            <button type="button" className="remove-photo" onClick={() => setPhoto("")}>Remove photo</button>
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="form-section-heading"><span>{picked ? "CLOSEST MIXES" : "PICK A COLOUR TO START"}</span><span className="ingredient-hint">Ranked by how alike they look</span></div>
        {!mixes.length ? (
          <p className="match-empty">Save a few mixes first. Matching compares against your archive.</p>
        ) : !picked ? (
          <p className="match-empty">Your closest mixes appear here.</p>
        ) : (
          <ol className="match-results" aria-label="Closest mixes">
            {matches.map(({ mix, difference }) => (
              <li key={mix.id}>
                <button className="match-result" type="button" onClick={() => onOpenMix(mix)} title={`View ${mix.name}`}>
                  <span className="match-pair" aria-hidden="true">
                    <i style={{ backgroundColor: target }} />
                    <i style={{ backgroundColor: mix.color }} />
                  </span>
                  <span className="match-copy">
                    <strong>{mix.name}</strong>
                    <small>{mix.paints.map((paint) => paint.name).filter(Boolean).join(" · ") || "No paints listed"}</small>
                  </span>
                  <span className="match-score">
                    <strong>{describeDifference(difference)}</strong>
                    <small>ΔE {difference.toFixed(1)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="match-footnote"><Pipette size={13} /> ΔE under 2 is hard to tell apart by eye; over 10 is a clearly different colour.</p>
      </div>
    </Modal>
  );
}
