/**
 * The little bit of nostalgic microcopy at the bottom of every page.
 * Kept to two lines — this is seasoning, not the personality.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-10 border-t border-[var(--color-line-soft)] py-5 text-center">
      <p className="microcopy">
        <span className="twinkle text-[var(--color-accent)]">✦</span> made with
        love in a small room{" "}
        <span className="twinkle text-[var(--color-accent)]">✦</span>
      </p>
      <p className="microcopy mt-1">best viewed with your eyes</p>
    </footer>
  );
}
