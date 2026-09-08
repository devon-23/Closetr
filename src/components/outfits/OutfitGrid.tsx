"use client";

import { useState, useTransition } from "react";
import { OutfitPreview } from "@/components/dressup/OutfitPreview";
import { StarToggle } from "@/components/ui/StarToggle";
import { deleteOutfit, setOutfitFavorite } from "@/app/outfits/actions";
import { savedOutfitPieces } from "@/lib/outfit";
import type { ClothingItem, Outfit } from "@/lib/types";

type OutfitGridProps = {
  outfits: Outfit[];
  /** The whole closet — outfits store item ids, not copies of the garments. */
  items: ClothingItem[];
};

/**
 * Saved outfits, each rendered live from its stored pieces.
 *
 * There's no cached thumbnail: the flat lay is a handful of absolutely
 * positioned PNGs the closet has already loaded, so drawing it is
 * cheaper than generating, storing and invalidating an image would be.
 */
export function OutfitGrid({ outfits, items }: OutfitGridProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function toggleFavorite(outfit: Outfit) {
    setError(null);
    startTransition(async () => {
      const result = await setOutfitFavorite(outfit.id, !outfit.favorite);
      if (!result.ok) setError(result.error);
    });
  }

  function remove(outfit: Outfit) {
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      const result = await deleteOutfit(outfit.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="microcopy mb-2 text-center text-[var(--color-accent)]"
        >
          {error}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {outfits.map((outfit) => {
          const pieces = savedOutfitPieces(outfit, items);
          const missing = outfit.items.length - pieces.length;

          return (
            <li
              key={outfit.id}
              className="border border-[var(--color-line)] bg-[var(--color-paper)]"
            >
              <OutfitPreview pieces={pieces} className="border-0" />

              <div className="flex items-center justify-between gap-1 border-t border-[var(--color-line)] px-2 py-1">
                <span className="min-w-0 truncate text-[10px] font-bold tracking-wider uppercase">
                  {outfit.name}
                </span>
                <div className="flex shrink-0 items-center">
                  <StarToggle
                    favorite={outfit.favorite}
                    itemName={outfit.name}
                    onToggle={() => toggleFavorite(outfit)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      confirming === outfit.id
                        ? remove(outfit)
                        : setConfirming(outfit.id)
                    }
                    onBlur={() => setConfirming(null)}
                    disabled={pending}
                    aria-label={`Delete ${outfit.name}`}
                    className="cursor-pointer px-1 text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase hover:text-[var(--color-accent)] disabled:opacity-40"
                  >
                    {confirming === outfit.id ? "sure?" : "✕"}
                  </button>
                </div>
              </div>

              {missing > 0 && (
                <p className="microcopy border-t border-[var(--color-line-soft)] px-2 py-1">
                  {missing} piece{missing === 1 ? "" : "s"} no longer in your
                  closet
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
