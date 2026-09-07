import { BevelLink } from "@/components/ui/BevelButton";
import { Panel } from "@/components/ui/Panel";
import { getClosetSummary } from "@/lib/data/closet";

/**
 * Home is intentionally a personal page, not a landing page: a greeting,
 * three links, one primary action, and a couple of counters.
 */
export default async function HomePage() {
  const { itemCount, outfitCount, favoriteCount } = await getClosetSummary();

  const lastUpdated = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });

  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <p className="display text-sm text-[var(--color-accent)]">
        <span className="twinkle">★</span> welcome!!!{" "}
        <span className="twinkle">★</span>
      </p>

      <p className="mt-3 text-[var(--color-ink-soft)]">
        everything you own, in one place.
        <br />
        pick something nice today.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <BevelLink href="/closet">Closet</BevelLink>
        <BevelLink href="/dress-up">Dress Up</BevelLink>
        <BevelLink href="/outfits">Outfits</BevelLink>
      </div>

      <div className="mt-5">
        <BevelLink href="/add" variant="primary" className="px-6 py-2 text-xs">
          ✨ Add to Closet ✨
        </BevelLink>
      </div>

      <Panel title="The Numbers" className="mt-8 text-left">
        <dl className="divide-y divide-[var(--color-line-soft)]">
          {[
            ["Items in closet", itemCount],
            ["Outfits saved", outfitCount],
            ["Favorites", favoriteCount],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between py-1.5"
            >
              <dt className="label">{label}</dt>
              <dd className="display text-base">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <p className="microcopy mt-6">last updated: {lastUpdated}</p>
    </div>
  );
}
