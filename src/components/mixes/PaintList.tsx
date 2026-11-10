import type { MixInput } from "../../types";
import type { PaintShelf } from "../../lib/paints";

/**
 * Title row with the paint count, then one line per paint with its brand and drops.
 * With a shelf (My paints), paints that aren't on it are marked.
 */
export function PaintList({ mix, shelf }: { mix: MixInput; shelf?: PaintShelf }) {
  const checkShelf = shelf && !shelf.isEmpty;
  return (
    <>
      <div className="mix-card-title-row">
        <h3>{mix.name}</h3>
        <span className="paint-count">{mix.paints.length} {mix.paints.length === 1 ? "paint" : "paints"}</span>
      </div>
      <div className="paint-list">
        {mix.paints.map((paint, index) => {
          const missing = checkShelf && paint.name.trim() !== "" && !shelf.owns(paint.brand, paint.name);
          return (
            <div className={`paint-line ${missing ? "missing" : ""}`} key={`${paint.name}-${index}`}>
              <span className="paint-name">
                {paint.name || "Untitled paint"}
                {missing && <span className="missing-paint" title="Not on My paints">not owned</span>}
              </span>
              <span className="paint-brand">{paint.brand}</span>
              <strong>{paint.drops} <small>{Number(paint.drops) === 1 ? "drop" : "drops"}</small></strong>
            </div>
          );
        })}
      </div>
    </>
  );
}
