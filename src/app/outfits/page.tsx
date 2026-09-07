import { Panel } from "@/components/ui/Panel";
import { BevelLink } from "@/components/ui/BevelButton";

export const metadata = { title: "My Closet — Outfits" };

export default function OutfitsPage() {
  return (
    <div className="space-y-4">
      <h1 className="display text-base">My Outfits</h1>
      <Panel>
        <div className="py-10 text-center">
          <p className="text-[var(--color-ink-soft)]">no outfits yet!!!</p>
          <p className="microcopy mt-1">
            saved outfits land here once the database is wired up.
          </p>
          <div className="mt-4">
            <BevelLink href="/dress-up" variant="primary">
              ★ Make one ★
            </BevelLink>
          </div>
        </div>
      </Panel>
    </div>
  );
}
