import { getBackgroundRemover } from "./background";
import {
  ORIGINAL_MAX_EDGE,
  VISION_MAX_EDGE,
  alphaCropToSquare,
  blobToBase64,
  blobToBitmap,
  decodeImage,
  dominantColor,
  downscale,
} from "./process";

/**
 * One photo, taken from picked file to upload-ready blobs.
 *
 * Extracted so the single-item and bulk flows can't drift: the batch
 * importer runs this same function per photo, which is the only reason
 * "add one" and "add twenty" produce identical images.
 *
 * Bitmaps are closed as soon as they're finished with. One leaked
 * 1600px bitmap is nothing; twenty of them held until GC is tens of MB
 * on a phone mid-import.
 */

export type IngestedPhoto = {
  /** Downscaled archive copy of what the user picked. */
  original: Blob;
  /** Square, background-removed PNG the closet and flat-lay render from. */
  processed: Blob;
  /** Average colour of the cut-out pixels. Null when removal failed. */
  swatch: string | null;
  /** Base64 JPEG sized for the metadata call. */
  visionBase64: string;
  /** Set when the background survived — the item is still usable. */
  notice: string | null;
};

export type IngestHooks = {
  onStatus?: (status: string) => void;
  /** Background-removal progress, 0-1. Only fires for the browser provider. */
  onProgress?: (fraction: number) => void;
};

export async function ingestPhoto(
  file: File,
  { onStatus, onProgress }: IngestHooks = {},
): Promise<IngestedPhoto> {
  onStatus?.("reading the photo...");
  const bitmap = await decodeImage(file);

  try {
    onStatus?.("shrinking it...");
    const original = await downscale(bitmap, ORIGINAL_MAX_EDGE, "image/jpeg");

    // Cheap, and needed before the bitmap is closed.
    const visionBase64 = await blobToBase64(
      await downscale(bitmap, VISION_MAX_EDGE, "image/jpeg"),
    );

    // Background removal is the one step allowed to fail. A visible photo
    // with its background still on beats no item at all.
    let processed: Blob;
    let swatch: string | null = null;
    let notice: string | null = null;

    try {
      onStatus?.("removing the background (first run downloads a model)...");
      const cutout = await getBackgroundRemover().remove(original, onProgress);
      const cutoutBitmap = await blobToBitmap(cutout);
      try {
        processed = await alphaCropToSquare(cutoutBitmap);
        swatch = await dominantColor(cutoutBitmap);
      } finally {
        cutoutBitmap.close();
      }
    } catch {
      notice = "couldn't cut out the background — kept the photo as it is.";
      // Opaque input means the alpha crop finds no margin to trim, so this
      // just squares the photo up.
      const plain = await blobToBitmap(original);
      try {
        processed = await alphaCropToSquare(plain);
      } finally {
        plain.close();
      }
    }

    return { original, processed, swatch, visionBase64, notice };
  } finally {
    bitmap.close();
  }
}
