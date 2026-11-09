export const MAX_PHOTO_FILE_SIZE = 8 * 1024 * 1024;
const MAX_PHOTO_EDGE = 1200;
const JPEG_QUALITY = 0.78;

/** Fetches any image (data URL, signed link, public link) and returns it as a data URL. */
export async function imageToDataUrl(link: string): Promise<string> {
  const blob = await (await fetch(link)).blob();
  return readAsDataUrl(blob);
}

export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photo could not be read. Please try another image."));
    image.src = src;
  });
}

/**
 * Checks a chosen photo, scales it so its longest edge is at most 1200 px, and re-encodes it as JPEG.
 * Throws an Error whose message can be shown as is.
 */
export async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file to add a photo.");
  if (file.size > MAX_PHOTO_FILE_SIZE) throw new Error("This photo is larger than 8 MB. Choose a smaller image.");

  const source = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be processed. Please try another image.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("The photo could not be processed. Please try another image.");
  return readAsDataUrl(blob);
}

export function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
