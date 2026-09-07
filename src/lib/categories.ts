/**
 * The clothing taxonomy.
 *
 * Deliberately small — six categories. Everything else is a tag.
 * Adding categories here has knock-on effects in the dress-up slot
 * layout below, so prefer a tag unless the item genuinely needs its
 * own position in the flat lay.
 */

export const CATEGORIES = [
  "tops",
  "bottoms",
  "dresses",
  "outerwear",
  "shoes",
  "accessories",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessories: "Accessories",
};

export const SUBCATEGORIES: Record<Category, string[]> = {
  tops: ["T-Shirt", "Long Sleeve", "Sweater", "Hoodie", "Tank", "Other"],
  bottoms: ["Jeans", "Pants", "Shorts", "Skirt", "Other"],
  dresses: ["Dress", "Jumpsuit", "Other"],
  outerwear: ["Jacket", "Coat", "Overshirt", "Vest", "Other"],
  shoes: ["Sneakers", "Boots", "Sandals", "Dress Shoes", "Other"],
  accessories: ["Hat", "Bag", "Jewelry", "Scarf", "Belt", "Other"],
};

/* ============================================================
   FLAT-LAY SLOT LAYOUT
   ============================================================ */

export type Slot = {
  /** Centre point as a percentage of the preview box. */
  x: number;
  y: number;
  /** Longest edge as a fraction of preview box width. */
  scale: number;
  /** Stacking order. Higher paints on top. */
  z: number;
  /** Slight rotation, in degrees, so the lay doesn't look like a grid. */
  rotate?: number;
};

/**
 * Where each category sits in the composition.
 *
 * This works because every processed image is normalised to the same
 * square canvas at ingest (alpha-cropped, then padded). Uniform source
 * images plus a per-category scale is what makes a coat render larger
 * than a shoe without anyone dragging anything.
 *
 * Item-level overrides live in `items.layout_overrides` for the
 * occasional piece that needs nudging — a long coat, a wide hat.
 */
export const CATEGORY_SLOTS: Record<Exclude<Category, "accessories">, Slot> = {
  outerwear: { x: 25, y: 37, scale: 0.46, z: 10, rotate: -4 },
  tops: { x: 51, y: 29, scale: 0.42, z: 20 },
  dresses: { x: 50, y: 44, scale: 0.5, z: 20 },
  bottoms: { x: 52, y: 63, scale: 0.4, z: 15 },
  shoes: { x: 50, y: 88, scale: 0.26, z: 25, rotate: 3 },
};

/**
 * Accessories fill these in order, so two or three can coexist down
 * the right-hand margin without colliding.
 */
export const ACCESSORY_SLOTS: Slot[] = [
  { x: 82, y: 19, scale: 0.19, z: 30, rotate: 5 },
  { x: 84, y: 43, scale: 0.19, z: 30, rotate: -6 },
  { x: 81, y: 66, scale: 0.17, z: 30, rotate: 3 },
  { x: 17, y: 76, scale: 0.16, z: 30, rotate: -3 },
];

/**
 * Categories that can't be worn at once. Selecting a dress clears the
 * top and bottoms, and vice versa.
 */
export const CONFLICTS: Partial<Record<Category, Category[]>> = {
  dresses: ["tops", "bottoms"],
  tops: ["dresses"],
  bottoms: ["dresses"],
};

/** Only one accessory slot per outfit in V1 would be sad; allow a few. */
export const MAX_ACCESSORIES = ACCESSORY_SLOTS.length;
