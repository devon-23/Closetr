/**
 * Client-side image normalisation.
 *
 * All of this runs in the browser on purpose. Originals are often 4-12MB
 * straight off a phone; shrinking before upload keeps us inside
 * Supabase's 1GB free tier and off the 1MB Server Action body limit.
 */

/** Longest edge kept for the archived original. */
export const ORIGINAL_MAX_EDGE = 1600;

/** Side length of the normalised, transparent flat-lay image. */
export const PROCESSED_SIZE = 1024;

/**
 * What we send to Claude for metadata. Small on purpose — image tokens
 * scale with pixels, and the model doesn't need 1600px to tell a hoodie
 * from a boot.
 */
export const VISION_MAX_EDGE = 768;

/** Alpha below this counts as background when finding the crop box. */
const ALPHA_THRESHOLD = 12;

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Couldn't get a 2D canvas context.");
  return { canvas, context };
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't encode the image.")),
      type,
      quality,
    );
  });
}

/**
 * Decode a picked file.
 *
 * HEIC (the iPhone default) is not decodable by `createImageBitmap` in
 * Chrome or Firefox, so we fail with something a human can act on rather
 * than a DOMException.
 */
export async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const isHeic = /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      isHeic
        ? "This browser can't read HEIC photos. On iPhone: Settings → Camera → Formats → Most Compatible, or upload a screenshot."
        : "That file didn't look like an image this browser can read.",
    );
  }
}

/** Scale so the longest edge is at most `maxEdge`. Never scales up. */
export async function downscale(
  source: ImageBitmap,
  maxEdge: number,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.85,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const { canvas, context } = canvasOf(width, height);

  // JPEG has no alpha; without this, transparent pixels encode as black.
  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(source, 0, 0, width, height);
  return toBlob(canvas, type, quality);
}

/**
 * Trim transparent margins, then letterbox onto a square.
 *
 * This is what makes the flat-lay work: the dress-up layout positions
 * every garment by a per-category scale, which only reads correctly if
 * each source image is framed identically. A coat that arrives with
 * three inches of empty pixels would render smaller than its slot.
 */
export async function alphaCropToSquare(
  source: ImageBitmap,
  size = PROCESSED_SIZE,
): Promise<Blob> {
  const { canvas: scratch, context: scratchContext } = canvasOf(
    source.width,
    source.height,
  );
  scratchContext.drawImage(source, 0, 0);

  const { data } = scratchContext.getImageData(
    0,
    0,
    source.width,
    source.height,
  );

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fully transparent — background removal ate the whole thing. Keep the
  // original frame rather than returning a zero-sized crop.
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = source.width - 1;
    maxY = source.height - 1;
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;

  // Fit the crop inside the square with a small margin, preserving aspect.
  const scale = (size * 0.94) / Math.max(cropWidth, cropHeight);
  const drawWidth = Math.round(cropWidth * scale);
  const drawHeight = Math.round(cropHeight * scale);

  const { canvas, context } = canvasOf(size, size);
  context.drawImage(
    scratch,
    minX,
    minY,
    cropWidth,
    cropHeight,
    Math.round((size - drawWidth) / 2),
    Math.round((size - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );

  return toBlob(canvas, "image/png");
}

/** Average colour of the opaque pixels, as a hex swatch. */
export async function dominantColor(source: ImageBitmap): Promise<string> {
  const side = 64;
  const { context } = canvasOf(side, side);
  context.drawImage(source, 0, 0, side, side);
  const { data } = context.getImageData(0, 0, side, side);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= ALPHA_THRESHOLD) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }

  if (count === 0) return "#cccccc";

  const hex = (value: number) =>
    Math.round(value / count)
      .toString(16)
      .padStart(2, "0");

  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Strips the `data:...;base64,` prefix the API doesn't want. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
