import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { toHex } from "../../lib/images";

interface Point { x: number; y: number }
interface Selection extends Point { width: number; height: number }
interface Magnifier { point: Point; color?: string; left: number; top: number; below: boolean }

const HELP = "Drag to target a pixel; release to sample the exact colour under the cursor.";
const LENS_WIDTH = 130;

interface ColorSamplerProps {
  /** The photo, as a data URL or a link to stored photo. */
  image: string;
  onPick: (color: string) => void;
  onError: (message: string) => void;
}

/**
 * The photo with a pixel picker: drag or click to sample, a magnifier while aiming, and arrow
 * keys + Enter for keyboard use. Pixels are read from a hidden full-size copy of the photo.
 */
export function ColorSampler({ image, onPick, onError }: ColorSamplerProps) {
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const sampleCanvas = useRef<HTMLCanvasElement>(null);
  const magnifierCanvas = useRef<HTMLCanvasElement>(null);
  const dragStart = useRef<Point | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [magnifier, setMagnifier] = useState<Magnifier | null>(null);
  const [message, setMessage] = useState(HELP);
  // The photo's pixel size, used to place the selection marker as a percentage.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // Draw the photo into both canvases whenever it changes.
  useEffect(() => {
    if (!previewCanvas.current || !sampleCanvas.current) return undefined;
    const source = new Image();
    source.onload = () => {
      const preview = previewCanvas.current;
      const sampler = sampleCanvas.current;
      if (!preview || !sampler) return;
      preview.width = sampler.width = source.naturalWidth;
      preview.height = sampler.height = source.naturalHeight;
      const previewContext = preview.getContext("2d");
      const sampleContext = sampler.getContext("2d", { willReadFrequently: true });
      if (!previewContext || !sampleContext) {
        onError("The photo could not be prepared for colour sampling.");
        return;
      }
      previewContext.drawImage(source, 0, 0);
      sampleContext.drawImage(source, 0, 0);
      setSize({ width: source.naturalWidth, height: source.naturalHeight });
      setSelection(null);
      setMessage(HELP);
    };
    source.onerror = () => onError("The photo could not be prepared for colour sampling.");
    // Account photos come from Supabase Storage; reading their pixels needs a CORS-enabled load.
    if (!image.startsWith("data:")) source.crossOrigin = "anonymous";
    source.src = image;
    return () => {
      source.onload = null;
      source.onerror = null;
    };
  }, [image, onError]);

  // Redraw the magnifier lens around the pixel under the pointer.
  const lensX = magnifier?.point.x;
  const lensY = magnifier?.point.y;
  useEffect(() => {
    const lens = magnifierCanvas.current;
    const source = sampleCanvas.current;
    const context = lens?.getContext("2d");
    if (lensX === undefined || lensY === undefined || !lens || !source || !context || !source.width || !source.height) return;

    const sampleSize = Math.min(21, source.width, source.height);
    const pixelX = Math.max(0, Math.min(source.width - 1, Math.floor(lensX)));
    const pixelY = Math.max(0, Math.min(source.height - 1, Math.floor(lensY)));
    lens.width = 126;
    lens.height = 126;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, lens.width, lens.height);
    context.drawImage(source, pixelX - Math.floor(sampleSize / 2), pixelY - Math.floor(sampleSize / 2), sampleSize, sampleSize, 0, 0, lens.width, lens.height);
    context.strokeStyle = "rgba(255,255,255,.32)";
    context.lineWidth = 1;
    for (let gridLine = 1; gridLine < 21; gridLine += 1) {
      const position = gridLine * 6 + 0.5;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, lens.height);
      context.moveTo(0, position);
      context.lineTo(lens.width, position);
      context.stroke();
    }

    try {
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return;
      const [red, green, blue] = sourceContext.getImageData(pixelX, pixelY, 1, 1).data;
      const color = toHex(red, green, blue);
      setMagnifier((current) => (!current || current.color === color ? current : { ...current, color }));
    } catch (magnifyError) {
      console.error("Could not magnify the photo colour:", magnifyError);
      onError("The photo pixels could not be magnified.");
    }
  }, [lensX, lensY, onError]);

  function imagePoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)),
    };
  }

  function updateMagnifier(event: PointerEvent<HTMLCanvasElement>) {
    // Measure now: React clears event.currentTarget before a state updater runs.
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = imagePoint(event);
    const displayX = event.clientX - bounds.left;
    const displayY = event.clientY - bounds.top;
    const left = Math.max(LENS_WIDTH / 2, Math.min(bounds.width - LENS_WIDTH / 2, displayX));
    setMagnifier((current) => ({ point, color: current?.color, left, top: displayY, below: displayY < 155 }));
  }

  function sampleColor(point: Point) {
    const canvas = sampleCanvas.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    try {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y)));
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
      if (alpha === 0) {
        onError("No visible colour was found in that part of the photo.");
        return;
      }
      const detected = toHex(red, green, blue);
      // Mark the sampled pixel with a 14-screen-pixel square.
      const bounds = previewCanvas.current?.getBoundingClientRect();
      const markerWidth = bounds ? Math.min(canvas.width, 14 * canvas.width / bounds.width) : 1;
      const markerHeight = bounds ? Math.min(canvas.height, 14 * canvas.height / bounds.height) : 1;
      onPick(detected);
      setSelection({
        x: Math.max(0, Math.min(canvas.width - markerWidth, x + 0.5 - markerWidth / 2)),
        y: Math.max(0, Math.min(canvas.height - markerHeight, y + 0.5 - markerHeight / 2)),
        width: markerWidth,
        height: markerHeight,
      });
      setMessage(`Sampled pixel ${detected.toUpperCase()}.`);
      onError("");
    } catch (sampleError) {
      console.error("Could not sample the photo colour:", sampleError);
      onError("The photo colour could not be detected. Try selecting another area.");
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!sampleCanvas.current?.width) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = imagePoint(event);
    dragStart.current = start;
    updateMagnifier(event);
    setSelection({ ...start, width: 1, height: 1 });
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    updateMagnifier(event);
    const start = dragStart.current;
    if (!start) return;
    const point = imagePoint(event);
    setSelection({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return;
    dragStart.current = null;
    sampleColor(imagePoint(event));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    const canvas = sampleCanvas.current;
    if (!canvas?.width) return;
    const size = Math.min(24, canvas.width, canvas.height);
    const current = selection || { x: (canvas.width - size) / 2, y: (canvas.height - size) / 2, width: size, height: size };
    if (event.key === "Enter" || event.key === " ") {
      sampleColor({ x: current.x + current.width / 2, y: current.y + current.height / 2 });
      return;
    }
    const step = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) * 0.02));
    const x = current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0);
    const y = current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
    setSelection({
      ...current,
      x: Math.max(0, Math.min(canvas.width - current.width, x)),
      y: Math.max(0, Math.min(canvas.height - current.height, y)),
    });
  }

  return (
    <>
      <div className="color-sampler-frame">
        <div className="color-sampler">
          <canvas ref={sampleCanvas} className="sr-only" aria-hidden="true" />
          <canvas
            ref={previewCanvas}
            className="color-sampler-canvas"
            role="button"
            tabIndex={0}
            aria-label="Photo colour sampler. Drag to select an area, or use arrow keys and press Enter."
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => { if (!dragStart.current) setMagnifier(null); }}
            onKeyDown={handleKeyDown}
          />
          {magnifier && (
            <div className={`color-magnifier ${magnifier.below ? "below-cursor" : ""}`} style={{ left: `${magnifier.left}px`, top: `${magnifier.top}px` }} aria-hidden="true">
              <canvas ref={magnifierCanvas} />
              <span className="magnifier-color">
                <i style={{ backgroundColor: magnifier.color || "#fff" }} />
                {magnifier.color?.toUpperCase() || "PIXEL"}
              </span>
            </div>
          )}
          {selection && size && (
            <span
              className="color-sampler-selection"
              style={{
                left: `${selection.x / size.width * 100}%`,
                top: `${selection.y / size.height * 100}%`,
                width: `${selection.width / size.width * 100}%`,
                height: `${selection.height / size.height * 100}%`,
              }}
            />
          )}
        </div>
      </div>
      <span className="sampler-help" aria-live="polite">{message}</span>
    </>
  );
}
