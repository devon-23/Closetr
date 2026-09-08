import type { SearchCandidate } from "@/lib/types";

/**
 * Turns a Google Vision WEB_DETECTION block into something the add form
 * can show.
 *
 * Pure, and separate from the route, because the selection rules here are
 * where the feature actually lives — which buckets get offered, in what
 * order, and what gets thrown away. See `web-detection.test.ts`.
 */

export type WebDetectionBlock = {
  bestGuessLabels?: { label?: string; languageCode?: string }[];
  /** Exact copies of the submitted photo found elsewhere. */
  fullMatchingImages?: { url?: string }[];
  /** Crops or edits of it. */
  partialMatchingImages?: { url?: string }[];
  pagesWithMatchingImages?: {
    url?: string;
    pageTitle?: string;
    fullMatchingImages?: { url?: string }[];
    partialMatchingImages?: { url?: string }[];
  }[];
  visuallySimilarImages?: { url?: string }[];
};

export type VisualSearchResult = {
  /** Vision's own words for the item, preferring English. */
  guess: string | null;
  /** Matches that carry provenance — a page to credit. */
  candidates: SearchCandidate[];
  /** Photos with no page attached. Often all a hard item turns up. */
  similarImages: string[];
};

const MAX_CANDIDATES = 8;
const MAX_SIMILAR = 12;

export function extractResults(
  detection: WebDetectionBlock | undefined,
): VisualSearchResult {
  const candidates: SearchCandidate[] = (detection?.pagesWithMatchingImages ?? [])
    .map((page) => ({
      title: (page.pageTitle ?? "").replace(/\s+/g, " ").trim(),
      url: page.url ?? "",
      imageUrl:
        page.fullMatchingImages?.[0]?.url ??
        page.partialMatchingImages?.[0]?.url ??
        null,
    }))
    // A match with no page or no name can't be shown as provenance, but
    // its image is still salvaged into the pool below.
    .filter((candidate) => candidate.url && candidate.title)
    .slice(0, MAX_CANDIDATES);

  /**
   * Ordered by how likely each bucket is to be the actual item: an exact
   * copy of the photo, then a crop of it, then something that merely
   * looks like it.
   */
  const similarImages = [
    ...new Set(
      [
        ...(detection?.fullMatchingImages ?? []),
        ...(detection?.partialMatchingImages ?? []),
        ...(detection?.visuallySimilarImages ?? []),
      ]
        .map((image) => image.url)
        // http images can't be fetched by /api/fetch-image, so offering
        // one would only produce an error the user can't act on.
        .filter((url): url is string => Boolean(url?.startsWith("https://"))),
    ),
  ]
    .filter((url) => !candidates.some((candidate) => candidate.imageUrl === url))
    .slice(0, MAX_SIMILAR);

  // Vision picks the language it thinks suits the image, not the caller —
  // a plain [0] can hand back a Persian label for an American hat, which
  // is no use as an item name. Prefer English, settle for anything.
  const labels = (detection?.bestGuessLabels ?? []).filter((entry) =>
    Boolean(entry.label),
  );
  const guess =
    labels.find((entry) => entry.languageCode === "en")?.label ??
    labels[0]?.label ??
    null;

  return { guess, candidates, similarImages };
}
