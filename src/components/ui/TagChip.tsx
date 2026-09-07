import { cn } from "@/lib/cn";

type TagChipProps = {
  label: string;
  /** Renders pressed when true — used for active tag filters. */
  active?: boolean;
  onClick?: () => void;
  /** Shows an × that removes the tag (in the item editor). */
  onRemove?: () => void;
  className?: string;
};

/**
 * `[ FALL ]` — the small bracketed tag label used throughout.
 * Renders as a <span> when inert so we don't put non-interactive
 * elements in the tab order.
 */
export function TagChip({
  label,
  active = false,
  onClick,
  onRemove,
  className,
}: TagChipProps) {
  const body = (
    <>
      <span className="opacity-40">[</span>
      <span className="mx-1">{label}</span>
      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove tag ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }
          }}
          className="cursor-pointer px-0.5 text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]"
        >
          ×
        </span>
      ) : (
        <span className="opacity-40">]</span>
      )}
    </>
  );

  const classes = cn(
    "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase",
    active
      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[#7d2f55]"
      : "border-[var(--color-line-soft)] bg-[var(--color-paper-alt)] text-[var(--color-ink-soft)]",
    onClick && "cursor-pointer hover:border-[var(--color-accent)]",
    className,
  );

  if (!onClick) {
    return <span className={classes}>{body}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={classes}
    >
      {body}
    </button>
  );
}
