import { Panel } from "@/components/ui/Panel";
import { BevelLink } from "@/components/ui/BevelButton";
import { OutfitGrid } from "@/components/outfits/OutfitGrid";
import { getOutfits } from "@/lib/data/outfits";
import { getClosetItems } from "@/lib/data/closet";

export const metadata = { title: "My Closet — Outfits" };

export default async function OutfitsPage() {
  // Both are request-cached, and the outfit rows hold item ids rather
  // than garments, so the closet is what turns them back into a picture.
  const [outfits, items] = await Promise.all([getOutfits(), getClosetItems()]);

  return (
    <div className="space-y-4">
      <h1 className="display text-base">My Outfits</h1>

      {outfits.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="text-[var(--color-ink-soft)]">no outfits yet!!!</p>
            <p className="microcopy mt-1">
              put some pieces together and hit save.
            </p>
            <div className="mt-4">
              <BevelLink href="/dress-up" variant="primary">
                ★ Make one ★
              </BevelLink>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel
          title="Saved"
          meta={`${outfits.length} ${outfits.length === 1 ? "OUTFIT" : "OUTFITS"}`}
        >
          <OutfitGrid outfits={outfits} items={items} />

          <div className="mt-4 text-center">
            <BevelLink href="/dress-up" variant="primary">
              ★ Make another ★
            </BevelLink>
          </div>
        </Panel>
      )}
    </div>
  );
}
