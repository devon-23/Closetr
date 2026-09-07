import type { Category } from "./categories";
import type { ClothingItem } from "./types";

export type SortKey = "recent" | "name" | "category";

export type ClosetFilters = {
  query: string;
  category: Category | "all";
  /** Tag names, ANDed together — a combinable filter set. */
  tagNames: string[];
  color: string | null;
  favoritesOnly: boolean;
  sort: SortKey;
};

export const EMPTY_FILTERS: ClosetFilters = {
  query: "",
  category: "all",
  tagNames: [],
  color: null,
  favoritesOnly: false,
  sort: "recent",
};

/**
 * Everything a free-text search should match. Searching "black" needs
 * to find the black hoodie, the black jeans, and anything tagged black,
 * so colour and tags go into the same haystack as the name.
 */
function haystack(item: ClothingItem): string {
  return [
    item.name,
    item.brand,
    item.category,
    item.subcategory,
    item.color,
    ...item.tags.map((tag) => tag.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Pure filter + sort. Kept free of React so the dress-up builder and
 * the eventual server-side query can share the same semantics.
 *
 * All active filters are ANDed: category AND every selected tag AND
 * colour AND favourites.
 */
export function filterItems(
  items: ClothingItem[],
  filters: ClosetFilters,
): ClothingItem[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const result = items.filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    if (filters.favoritesOnly && !item.favorite) return false;
    if (filters.color && item.color !== filters.color) return false;

    if (filters.tagNames.length > 0) {
      const names = new Set(item.tags.map((tag) => tag.name));
      if (!filters.tagNames.every((name) => names.has(name))) return false;
    }

    if (terms.length > 0) {
      const text = haystack(item);
      // Every term must appear somewhere — "black nike" narrows.
      if (!terms.every((term) => text.includes(term))) return false;
    }

    return true;
  });

  return result.sort((a, b) => {
    switch (filters.sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "category":
        return (
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        );
      case "recent":
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
}

/** Distinct colour names present in the closet, for the colour filter. */
export function availableColors(items: ClothingItem[]): string[] {
  return [...new Set(items.map((item) => item.color).filter(Boolean))].sort() as string[];
}

export function activeFilterCount(filters: ClosetFilters): number {
  return (
    (filters.category !== "all" ? 1 : 0) +
    filters.tagNames.length +
    (filters.color ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0) +
    (filters.query.trim() ? 1 : 0)
  );
}
