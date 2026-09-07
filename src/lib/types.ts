import type { Category, Slot } from "./categories";

/** A tag's broad grouping. `custom` is the escape hatch and is expected
 *  to be common — "Twenty One Pilots" belongs to no taxonomy. */
export type TagKind =
  | "season"
  | "occasion"
  | "activity"
  | "vibe"
  | "weather"
  | "custom";

export type Tag = {
  id: string;
  name: string;
  kind: TagKind;
};

export type ClothingItem = {
  id: string;
  name: string;
  brand: string | null;
  category: Category;
  subcategory: string | null;
  /** Human-readable primary colour, e.g. "Black". Used for search + filters. */
  color: string | null;
  /** Hex, for the colour swatch in filters. Nullable — not every item has one. */
  colorHex: string | null;

  /** What the user photographed. Kept so they can reprocess later. */
  originalImageUrl: string | null;
  /** The normalised transparent PNG. This is what the UI renders. */
  processedImageUrl: string | null;

  /** Where a matched product image came from, if online search was used. */
  sourceUrl: string | null;
  sourceTitle: string | null;

  favorite: boolean;
  tags: Tag[];

  /** Per-item nudges to the category slot, for pieces that need it. */
  layoutOverrides: Partial<Slot> | null;

  createdAt: string;
  updatedAt: string;
};

export type OutfitItem = {
  itemId: string;
  category: Category;
  /** Resolved slot at save time, so an outfit renders identically later
   *  even if we change the default layout. */
  slot: Slot;
};

export type Outfit = {
  id: string;
  name: string;
  previewImageUrl: string | null;
  items: OutfitItem[];
  tags: Tag[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

/** One online match from Google Vision's web detection. */
export type SearchCandidate = {
  title: string;
  url: string;
  imageUrl: string | null;
};

/** The in-progress selection in the Dress Up builder. */
export type OutfitDraft = {
  /** One item per category, except accessories which holds several. */
  selections: Partial<Record<Category, string[]>>;
};
