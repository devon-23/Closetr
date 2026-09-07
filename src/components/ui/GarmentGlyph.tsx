import type { Category } from "@/lib/categories";

/**
 * Flat silhouette per category.
 *
 * Serves two jobs: placeholder art while we have no real closet, and
 * the permanent fallback for an item whose PNG is still processing or
 * failed. Drawn as simple outlines so it reads as a sketch, not as a
 * broken image.
 */
const PATHS: Record<Category, string> = {
  tops: "M30 18 L42 13 Q50 20 58 13 L70 18 L83 31 L72 41 L68 37 L68 87 L32 87 L32 37 L28 41 L17 31 Z",
  bottoms: "M32 12 L68 12 L72 50 L70 91 L56 91 L50 53 L44 91 L30 91 L28 50 Z",
  dresses:
    "M34 15 L44 10 Q50 17 56 10 L66 15 L75 29 L66 35 L64 31 L77 89 L23 89 L36 31 L34 35 L25 29 Z",
  outerwear:
    "M30 16 L44 11 L50 27 L56 11 L70 16 L83 31 L72 41 L68 37 L68 89 L52 89 L50 31 L48 89 L32 89 L32 37 L28 41 L17 31 Z",
  shoes:
    "M13 65 Q15 43 30 41 L45 41 L57 52 L79 58 Q89 61 89 69 L89 76 L13 76 Z",
  accessories: "M31 37 L69 37 L75 85 L25 85 Z M40 37 Q50 15 60 37",
};

type GarmentGlyphProps = {
  category: Category;
  /** CSS colour for the fill. Falls back to a neutral paper tone. */
  color?: string | null;
  className?: string;
};

export function GarmentGlyph({
  category,
  color,
  className,
}: GarmentGlyphProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={PATHS[category]}
        fill={color ?? "#e8e4ee"}
        stroke="#6d6579"
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
