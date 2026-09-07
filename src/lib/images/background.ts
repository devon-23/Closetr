/**
 * Background removal, behind a provider seam.
 *
 * The browser provider is the default and the only one that costs
 * nothing: `@imgly/background-removal` runs a segmentation model via
 * WASM/WebGPU on the user's machine. It fetches ~40MB of model weights
 * from a CDN on first use and caches them, so the first item is slow and
 * every later one is quick.
 *
 * Server-side removal was rejected for V1: a self-hosted ONNX runtime
 * fights Vercel's bundle size limit and function timeouts. The seam
 * exists so a paid API can be dropped in later without touching callers.
 */

export type BackgroundRemover = {
  readonly name: string;
  /** Returns a PNG with the garment isolated on transparency. */
  remove: (input: Blob, onProgress?: (fraction: number) => void) => Promise<Blob>;
};

const browserRemover: BackgroundRemover = {
  name: "browser",
  async remove(input, onProgress) {
    // Imported lazily so the WASM bundle never lands in the initial page
    // payload — most visits to /add never get as far as processing.
    const { removeBackground } = await import("@imgly/background-removal");

    return removeBackground(input, {
      output: { format: "image/png" },
      progress: (key, current, total) => {
        if (total > 0) onProgress?.(current / total);
        void key;
      },
    });
  },
};

const unconfiguredRemover = (provider: string): BackgroundRemover => ({
  name: provider,
  async remove() {
    throw new Error(
      `Background removal provider "${provider}" isn't wired up yet. ` +
        `Set NEXT_PUBLIC_BG_REMOVAL_PROVIDER=browser to use the free ` +
        `on-device one.`,
    );
  },
});

export function getBackgroundRemover(): BackgroundRemover {
  const provider = process.env.NEXT_PUBLIC_BG_REMOVAL_PROVIDER ?? "browser";
  return provider === "browser" ? browserRemover : unconfiguredRemover(provider);
}
