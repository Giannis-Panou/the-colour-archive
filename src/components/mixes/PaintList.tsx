import type { MixInput } from "../../types";

/** Title row with the paint count, then one line per paint with its brand and drops. */
export function PaintList({ mix }: { mix: MixInput }) {
  return (
    <>
      <div className="mix-card-title-row">
        <h3>{mix.name}</h3>
        <span className="paint-count">{mix.paints.length} {mix.paints.length === 1 ? "paint" : "paints"}</span>
      </div>
      <div className="paint-list">
        {mix.paints.map((paint, index) => (
          <div className="paint-line" key={`${paint.name}-${index}`}>
            <span className="paint-name">{paint.name || "Untitled paint"}</span>
            <span className="paint-brand">{paint.brand}</span>
            <strong>{paint.drops} <small>{Number(paint.drops) === 1 ? "drop" : "drops"}</small></strong>
          </div>
        ))}
      </div>
    </>
  );
}
