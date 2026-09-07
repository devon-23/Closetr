import {
  ACCESSORY_SLOTS,
  CATEGORY_SLOTS,
  CONFLICTS,
  MAX_ACCESSORIES,
  type Category,
  type Slot,
} from "./categories";
import type { ClothingItem, OutfitDraft } from "./types";

export const EMPTY_DRAFT: OutfitDraft = { selections: {} };

/**
 * Resolve where an item sits in the flat lay.
 *
 * `index` only matters for accessories, which cycle through their own
 * slot list so several can coexist. Item-level overrides are applied
 * last so a long coat or a wide hat can be nudged without touching the
 * category defaults.
 */
export function resolveSlot(item: ClothingItem, index = 0): Slot {
  const base =
    item.category === "accessories"
      ? ACCESSORY_SLOTS[index % ACCESSORY_SLOTS.length]
      : CATEGORY_SLOTS[item.category];

  return { ...base, ...(item.layoutOverrides ?? {}) };
}

/** Items currently selected, in paint order (back to front). */
export function draftItems(
  draft: OutfitDraft,
  items: ClothingItem[],
): { item: ClothingItem; slot: Slot }[] {
  const byId = new Map(items.map((item) => [item.id, item]));

  const selected = Object.values(draft.selections)
    .flatMap((ids) => ids ?? [])
    .map((id) => byId.get(id))
    .filter((item): item is ClothingItem => Boolean(item));

  // Accessories are numbered so each lands in a different margin slot.
  let accessoryIndex = 0;

  return selected
    .map((item) => ({
      item,
      slot: resolveSlot(
        item,
        item.category === "accessories" ? accessoryIndex++ : 0,
      ),
    }))
    .sort((a, b) => a.slot.z - b.slot.z);
}

export function isSelected(draft: OutfitDraft, itemId: string): boolean {
  return Object.values(draft.selections).some((ids) => ids?.includes(itemId));
}

/**
 * Click behaviour for the builder:
 *   - clicking a new item in a category replaces what was there
 *   - clicking the selected item again removes it
 *   - accessories accumulate up to MAX_ACCESSORIES instead of replacing
 *   - selecting a dress clears tops and bottoms (and vice versa)
 */
export function toggleItem(
  draft: OutfitDraft,
  item: ClothingItem,
): OutfitDraft {
  const { category } = item;
  const current = draft.selections[category] ?? [];
  const selections = { ...draft.selections };

  if (current.includes(item.id)) {
    const remaining = current.filter((id) => id !== item.id);
    if (remaining.length > 0) selections[category] = remaining;
    else delete selections[category];
    return { selections };
  }

  if (category === "accessories") {
    // Oldest accessory drops off once the slots are full.
    selections[category] = [...current, item.id].slice(-MAX_ACCESSORIES);
  } else {
    selections[category] = [item.id];
    for (const conflict of CONFLICTS[category] ?? []) {
      delete selections[conflict];
    }
  }

  return { selections };
}

/**
 * A plausible random outfit. No AI — just weighted coin flips over
 * what's actually in the closet, with the same conflict rules the
 * manual builder uses.
 */
export function randomOutfit(items: ClothingItem[]): OutfitDraft {
  const pool = (category: Category) =>
    items.filter((item) => item.category === category);
  const pick = <T,>(list: T[]): T | undefined =>
    list.length ? list[Math.floor(Math.random() * list.length)] : undefined;

  let draft = EMPTY_DRAFT;
  const add = (item: ClothingItem | undefined) => {
    if (item) draft = toggleItem(draft, item);
  };

  // A dress replaces the top/bottom pairing about a third of the time,
  // but only if there are dresses to choose from.
  const dresses = pool("dresses");
  if (dresses.length > 0 && Math.random() < 0.3) {
    add(pick(dresses));
  } else {
    add(pick(pool("tops")));
    add(pick(pool("bottoms")));
  }

  add(pick(pool("shoes")));

  if (Math.random() < 0.5) add(pick(pool("outerwear")));

  const accessories = pool("accessories");
  const accessoryCount = Math.floor(Math.random() * 3); // 0–2
  const shuffled = [...accessories].sort(() => Math.random() - 0.5);
  shuffled.slice(0, accessoryCount).forEach(add);

  return draft;
}

export function draftSize(draft: OutfitDraft): number {
  return Object.values(draft.selections).reduce(
    (total, ids) => total + (ids?.length ?? 0),
    0,
  );
}
