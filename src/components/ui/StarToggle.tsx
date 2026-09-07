"use client";

import { cn } from "@/lib/cn";

type StarToggleProps = {
  favorite: boolean;
  onToggle: () => void;
  /** Name of the thing being favourited, for the accessible label. */
  itemName: string;
  className?: string;
};

/**
 * ☆ / ★ favourite control.
 *
 * The glyph itself changes shape (hollow vs filled), so the state is
 * never communicated by colour alone.
 */
export function StarToggle({
  favorite,
  onToggle,
  itemName,
  className,
}: StarToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={
        favorite ? `Unfavorite ${itemName}` : `Add ${itemName} to favorites`
      }
      title={favorite ? "Remove from favorites" : "Add to favorites"}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      className={cn(
        "cursor-pointer px-1 text-base leading-none transition-transform duration-100 hover:scale-125",
        favorite ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]",
        className,
      )}
    >
      {favorite ? "★" : "☆"}
    </button>
  );
}
