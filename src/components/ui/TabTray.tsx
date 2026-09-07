"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

export type TabOption<T extends string> = {
  value: T;
  label: string;
  /** Optional trailing count, e.g. TOPS (12) */
  count?: number;
};

type TabTrayProps<T extends string> = {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Filter by category". */
  label: string;
  className?: string;
};

/**
 * The `[ TOPS ] [ BOTTOMS ] [ SHOES ]` control. Single-select, used
 * for both closet filtering and dress-up category switching.
 *
 * Implements the roving-tabindex pattern: one stop in the tab order,
 * arrow keys move between options. Selection is not colour-only —
 * the active tab is visually pressed (inset bevel) and carries
 * aria-selected.
 */
export function TabTray<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: TabTrayProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent) {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : event.key === "Home"
            ? "first"
            : event.key === "End"
              ? "last"
              : null;
    if (delta === null) return;
    event.preventDefault();

    const index = options.findIndex((option) => option.value === value);
    const next =
      delta === "first"
        ? 0
        : delta === "last"
          ? options.length - 1
          : (index + delta + options.length) % options.length;

    onChange(options[next].value);
    // Move focus along with selection so the pattern stays coherent.
    ref.current
      ?.querySelectorAll<HTMLButtonElement>("[role='tab']")
      [next]?.focus();
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "btn",
              selected ? "bevel-in" : "bevel",
              selected && "text-[#7d2f55]",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="font-normal opacity-60">({option.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
