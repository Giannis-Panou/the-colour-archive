import { Image as ImageIcon, Palette } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { MixInput } from "../../types";

interface MixSwatchProps {
  mix: MixInput;
  /** "mix-image" on archive cards, "shared-mix-image" on shared pages. */
  className: string;
  /** Overlay buttons, e.g. share / edit / delete. */
  children?: ReactNode;
}

/** The colour block at the top of a mix card: the photo, or the saved colour, with a toggle between them. */
export function MixSwatch({ mix, className, children }: MixSwatchProps) {
  const [showSavedColor, setShowSavedColor] = useState(false);
  const hex = mix.color.toUpperCase();

  return (
    <div className={className} style={{ backgroundColor: mix.color }}>
      {mix.image && !showSavedColor
        ? <img src={mix.image} alt={`Photo of ${mix.name}`} />
        : <div className="saved-color-preview" role="img" aria-label={`Saved mix colour ${hex}`} />}
      {mix.image && (
        <button
          className="image-color-toggle"
          type="button"
          aria-label={showSavedColor ? "Show mix photo" : "Show saved colour"}
          title={showSavedColor ? "Show mix photo" : "Show saved colour"}
          onClick={() => setShowSavedColor((shown) => !shown)}
        >
          {showSavedColor ? <ImageIcon size={14} /> : <Palette size={14} />}
          <span>{showSavedColor ? "Show photo" : "Saved colour"}</span>
        </button>
      )}
      <span className="color-code">{hex}</span>
      {children}
    </div>
  );
}
