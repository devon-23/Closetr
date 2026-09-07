import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PanelProps = {
  /** Text shown in the title bar. Omit for a plain bordered panel. */
  title?: string;
  /** Right-aligned title bar content, e.g. "127 ITEMS". */
  meta?: ReactNode;
  /** Removes interior padding, for edge-to-edge grids. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * The workhorse container: a 1px-bordered box with an optional
 * old-web title bar. Nearly every section of the site sits in one.
 */
export function Panel({
  title,
  meta,
  flush = false,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section className={cn("panel", className)}>
      {title && (
        <header className="panel-titlebar">
          <h2 className="truncate">{title}</h2>
          {meta && (
            <span className="shrink-0 text-[10px] tracking-wider opacity-90">
              {meta}
            </span>
          )}
        </header>
      )}
      <div className={cn(!flush && "p-3 sm:p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
