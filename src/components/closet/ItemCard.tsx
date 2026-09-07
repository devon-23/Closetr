"use client";

import { GarmentGlyph } from "@/components/ui/GarmentGlyph";
import { StarToggle } from "@/components/ui/StarToggle";
import type { ClothingItem } from "@/lib/types";

type ItemCardProps = {
  item: ClothingItem;
  onOpen: (item: ClothingItem) => void;
  onToggleFavorite: (item: ClothingItem) => void;
};

/**
 * A thin-bordered box: image well on top, a single name row beneath.
 * No shadows on the card itself, no rounded corners, no metadata
 * clutter — the garment is the only thing with visual weight.
 */
export function ItemCard({ item, onOpen, onToggleFavorite }: ItemCardProps) {
  return (
    <article className="group border border-[var(--color-line)] bg-[var(--color-paper)] transition-[border-color,box-shadow] duration-100 hover:border-[var(--color-accent)] hover:shadow-[2px_2px_0_var(--color-accent-soft)]">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full cursor-pointer"
        aria-label={`View details for ${item.name}`}
      >
        <div className="flex aspect-square items-center justify-center bg-[var(--color-paper-alt)] p-3">
          {item.processedImageUrl ? (
            // Supabase storage serves these already sized; next/image adds
            // nothing but a proxy hop for transparent PNGs we control.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.processedImageUrl}
              alt={item.name}
              className="h-full w-full object-contain transition-transform duration-100 group-hover:scale-105"
            />
          ) : (
            <GarmentGlyph
              category={item.category}
              color={item.colorHex}
              className="h-full w-full transition-transform duration-100 group-hover:scale-105"
            />
          )}
        </div>
      </button>

      <div className="flex items-center justify-between gap-1 border-t border-[var(--color-line)] px-2 py-1">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="min-w-0 cursor-pointer truncate text-left text-[10px] font-bold tracking-wider uppercase hover:text-[var(--color-accent)]"
        >
          {item.name}
        </button>
        <StarToggle
          favorite={item.favorite}
          itemName={item.name}
          onToggle={() => onToggleFavorite(item)}
        />
      </div>
    </article>
  );
}
