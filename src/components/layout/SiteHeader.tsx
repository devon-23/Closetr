"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/closet", label: "Closet" },
  { href: "/dress-up", label: "Dress Up" },
  { href: "/outfits", label: "Outfits" },
  { href: "/add", label: "Add Item" },
];

/**
 * Pipe-delimited text navigation — `| HOME | CLOSET | ... |`.
 * Text links, not buttons: this is the single strongest signal that
 * the site is an early-web page rather than an app chrome.
 */
export function SiteHeader() {
  const pathname = usePathname();

  // The login page stands on its own — no nav, nothing to sign out of.
  if (pathname === "/login") return null;

  return (
    <header className="relative z-10 border-b border-[var(--color-line)] bg-[var(--color-paper)]">
      <div className="relative mx-auto max-w-5xl px-4 py-3 text-center">
        <Link
          href="/"
          className="display inline-block text-lg text-[var(--color-ink)] no-underline sm:text-xl"
        >
          <span className="text-[var(--color-accent)]">★</span> My Closet{" "}
          <span className="text-[var(--color-accent)]">★</span>
        </Link>

        <nav aria-label="Main" className="mt-2">
          <ul className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-[11px] font-bold tracking-widest uppercase">
            {LINKS.map((link, index) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <li key={link.href} className="flex items-center">
                  <span
                    aria-hidden="true"
                    className="px-1.5 text-[var(--color-line)]"
                  >
                    |
                  </span>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "px-0.5",
                      active
                        ? "text-[var(--color-accent)] underline decoration-2"
                        : "text-[var(--color-link)] no-underline hover:underline",
                    )}
                  >
                    {link.label}
                  </Link>
                  {index === LINKS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="px-1.5 text-[var(--color-line)]"
                    >
                      |
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Tucked into the corner — this is a personal site, not an app
            with an account menu. */}
        <form action={signOut} className="absolute top-2 right-3">
          <button
            type="submit"
            className="microcopy cursor-pointer hover:text-[var(--color-accent)] hover:underline"
          >
            sign out
          </button>
        </form>
      </div>
    </header>
  );
}
