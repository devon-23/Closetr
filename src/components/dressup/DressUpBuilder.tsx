"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { BevelButton } from "@/components/ui/BevelButton";
import { TabTray, type TabOption } from "@/components/ui/TabTray";
import { ItemCarousel } from "@/components/dressup/ItemCarousel";
import { OutfitPreview } from "@/components/dressup/OutfitPreview";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import {
  EMPTY_DRAFT,
  draftItems,
  draftSize,
  randomOutfit,
  toggleItem,
} from "@/lib/outfit";
import type { ClothingItem } from "@/lib/types";

type DressUpBuilderProps = {
  items: ClothingItem[];
};

/**
 * Category tabs on top, one carousel at a time below, live flat-lay
 * preview above. No dragging, no canvas, no mannequin — a click picks
 * a piece and the preview redraws itself.
 */
export function DressUpBuilder({ items }: DressUpBuilderProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [category, setCategory] = useState<Category>("tops");

  const pieces = useMemo(() => draftItems(draft, items), [draft, items]);

  const tabs: TabOption<Category>[] = useMemo(
    () =>
      CATEGORIES.map((value) => ({
        value,
        label: CATEGORY_LABELS[value],
        count: items.filter((item) => item.category === value).length,
      })),
    [items],
  );

  const shown = useMemo(
    () => items.filter((item) => item.category === category),
    [items, category],
  );

  const count = draftSize(draft);

  return (
    <div className="space-y-4">
      <h1 className="display text-center text-base">
        <span className="text-[var(--color-accent)]">★</span> Dress Up{" "}
        <span className="text-[var(--color-accent)]">★</span>
      </h1>

      <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr] md:items-start">
        <Panel
          title="Current Outfit"
          meta={`${count} ${count === 1 ? "piece" : "pieces"}`}
        >
          <OutfitPreview pieces={pieces} className="border-0" />

          {pieces.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {pieces.map(({ item }) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 text-[10px] tracking-wide uppercase"
                >
                  <span className="truncate">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => setDraft(toggleItem(draft, item))}
                    aria-label={`Remove ${item.name} from outfit`}
                    className="cursor-pointer px-1 text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap justify-center gap-2 border-t border-[var(--color-line-soft)] pt-3">
            <BevelButton onClick={() => setDraft(randomOutfit(items))}>
              🎲 Surprise me
            </BevelButton>
            <BevelButton
              onClick={() => setDraft(EMPTY_DRAFT)}
              disabled={count === 0}
            >
              ↻ Start over
            </BevelButton>
            <BevelButton variant="primary" disabled={count === 0}>
              ★ Save ★
            </BevelButton>
          </div>
        </Panel>

        <div className="space-y-3">
          <TabTray
            label="Choose a category"
            options={tabs}
            value={category}
            onChange={setCategory}
          />

          <Panel title={CATEGORY_LABELS[category]} meta={`${shown.length}`}>
            <ItemCarousel
              items={shown}
              label={CATEGORY_LABELS[category]}
              selectedIds={draft.selections[category] ?? []}
              onPick={(item) => setDraft(toggleItem(draft, item))}
            />
            <p className="microcopy mt-2 text-center">
              click to wear · click again to take it off · swipe to browse
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
