"use client";

import { useRef } from "react";
import { GarmentGlyph } from "@/components/ui/GarmentGlyph";
import { cn } from "@/lib/cn";
import type { ClothingItem } from "@/lib/types";

type ItemCarouselProps = {
  items: ClothingItem[];
  selectedIds: string[];
  onPick: (item: ClothingItem) => void;
  /** Accessible name, e.g. "Tops". */
  label: string;
};

/**
 * Horizontal strip of clothing you flip through.
 *
 * Scrolling is a plain overflow container with CSS scroll-snap, so
 * touch swipe, trackpad, and shift-scroll all work natively — no
 * gesture library, nothing to fight on mobile. The arrows page it for
 * mouse and keyboard users.
 */
export function ItemCarousel({
  items,
  selectedIds,
  onPick,
  label,
}: ItemCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null);

  function page(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    // Scroll by ~80% of the viewport so a card stays visible as an anchor.
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" });
  }

  if (items.length === 0) {
    return (
      <p className="microcopy py-8 text-center">
        no {label.toLowerCase()} in your closet yet.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => page(-1)}
        aria-label={`Scroll ${label} left`}
        className="bevel btn shrink-0 self-stretch px-2"
      >
        ◀
      </button>

      <ul
        ref={trackRef}
        aria-label={label}
        className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth py-1"
      >
        {items.map((item) => {
          const selected = selectedIds.includes(item.id);
          return (
            <li key={item.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onPick(item)}
                aria-pressed={selected}
                title={selected ? `Remove ${item.name}` : `Wear ${item.name}`}
                className={cn(
                  "flex w-20 cursor-pointer flex-col items-center border bg-[var(--color-paper)] p-1 transition-transform duration-100 hover:-translate-y-0.5 sm:w-24",
                  selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[2px_2px_0_var(--color-accent)]"
                    : "border-[var(--color-line)]",
                )}
              >
                <span className="flex aspect-square w-full items-center justify-center">
                  {item.processedImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.processedImageUrl}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <GarmentGlyph
                      category={item.category}
                      color={item.colorHex}
                      className="h-full w-full"
                    />
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 w-full text-center text-[9px] leading-tight font-bold tracking-wide uppercase">
                  {item.name}
                </span>
                {/* Selection is marked with a glyph as well as colour. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "text-[10px]",
                    selected
                      ? "text-[var(--color-accent)]"
                      : "text-transparent",
                  )}
                >
                  ✓ worn
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => page(1)}
        aria-label={`Scroll ${label} right`}
        className="bevel btn shrink-0 self-stretch px-2"
      >
        ▶
      </button>
    </div>
  );
}
