"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { TabTray, type TabOption } from "@/components/ui/TabTray";
import { TagChip } from "@/components/ui/TagChip";
import { BevelButton, BevelLink } from "@/components/ui/BevelButton";
import { ItemCard } from "@/components/closet/ItemCard";
import { ItemDetailModal } from "@/components/closet/ItemDetailModal";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  availableColors,
  filterItems,
  type ClosetFilters,
  type SortKey,
} from "@/lib/filters";
import { setFavorite, type ItemPatch } from "@/app/closet/actions";
import type { ClothingItem, Tag } from "@/lib/types";

type ClosetBrowserProps = {
  initialItems: ClothingItem[];
  allTags: Tag[];
};

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Newest" },
  { value: "name", label: "A–Z" },
  { value: "category", label: "Category" },
];

export function ClosetBrowser({ initialItems, allTags }: ClosetBrowserProps) {
  const [items, setItems] = useState(initialItems);
  const [filters, setFilters] = useState<ClosetFilters>(EMPTY_FILTERS);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [serverItems, setServerItems] = useState(initialItems);

  // Mutations update `items` optimistically, then call a Server Action
  // that ends in refresh(). When the re-rendered server tree arrives,
  // this swaps the optimistic guess for the truth — and repairs it if
  // the write actually failed.
  //
  // Adjusting state during render rather than in an effect: React reruns
  // this component with the new value before touching the DOM, so there's
  // no throwaway paint of the stale list.
  if (serverItems !== initialItems) {
    setServerItems(initialItems);
    setItems(initialItems);
  }

  // Derived, not stored. A snapshot taken when the modal opened would go
  // stale the moment a refresh landed underneath it.
  const openItem = items.find((item) => item.id === openItemId) ?? null;

  const update = <K extends keyof ClosetFilters>(
    key: K,
    value: ClosetFilters[K],
  ) => setFilters((prev) => ({ ...prev, [key]: value }));

  const visible = useMemo(
    () => filterItems(items, filters),
    [items, filters],
  );

  const categoryTabs: TabOption<Category | "all">[] = useMemo(
    () => [
      { value: "all", label: "All", count: items.length },
      ...CATEGORIES.map((category) => ({
        value: category,
        label: CATEGORY_LABELS[category],
        count: items.filter((item) => item.category === category).length,
      })),
    ],
    [items],
  );

  const colors = useMemo(() => availableColors(items), [items]);
  const tagsByKind = useMemo(() => {
    const groups: Record<string, Tag[]> = {};
    for (const tag of allTags) (groups[tag.kind] ??= []).push(tag);
    return groups;
  }, [allTags]);

  function toggleFavorite(target: ClothingItem) {
    const next = !target.favorite;

    setItems((prev) =>
      prev.map((item) =>
        item.id === target.id ? { ...item, favorite: next } : item,
      ),
    );

    void setFavorite(target.id, next);
  }

  /** Apply a saved edit locally so the modal updates without waiting. */
  function applyPatch(target: ClothingItem, patch: ItemPatch) {
    const tagByName = new Map(
      allTags.map((tag) => [tag.name.toLowerCase(), tag]),
    );

    const merged: ClothingItem = {
      ...target,
      name: patch.name.trim(),
      brand: patch.brand,
      category: patch.category,
      subcategory: patch.subcategory,
      color: patch.color,
      colorHex: patch.colorHex,
      // A tag the user just invented has no row here yet; the refresh
      // that follows replaces this stand-in with the real one.
      tags: patch.tagNames.map(
        (name) =>
          tagByName.get(name.toLowerCase()) ?? {
            id: `pending-${name}`,
            name,
            kind: "custom" as const,
          },
      ),
    };

    setItems((prev) =>
      prev.map((item) => (item.id === target.id ? merged : item)),
    );
  }

  function removeItem(target: ClothingItem) {
    setItems((prev) => prev.filter((item) => item.id !== target.id));
    setOpenItemId(null);
  }

  function toggleTag(name: string) {
    update(
      "tagNames",
      filters.tagNames.includes(name)
        ? filters.tagNames.filter((t) => t !== name)
        : [...filters.tagNames, name],
    );
  }

  const filterCount = activeFilterCount(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="display text-base">My Clothes</h1>
        <p className="label">{items.length} items</p>
      </div>

      <TabTray
        label="Filter by category"
        options={categoryTabs}
        value={filters.category}
        onChange={(value) => update("category", value)}
      />

      <Panel title="Find Something">
        <div className="space-y-3">
          <div>
            <label htmlFor="closet-search" className="sr-only">
              Search my closet
            </label>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-sm">
                🔎
              </span>
              <input
                id="closet-search"
                type="search"
                value={filters.query}
                onChange={(event) => update("query", event.target.value)}
                placeholder="Search my closet..."
                className="field"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Color"
              value={filters.color ?? ""}
              onChange={(value) => update("color", value || null)}
              placeholder="Any"
              options={colors.map((color) => ({ value: color, label: color }))}
            />
            <Select
              label="Sort"
              value={filters.sort}
              onChange={(value) => update("sort", value as SortKey)}
              options={SORTS}
            />
            <BevelButton
              aria-pressed={filters.favoritesOnly}
              onClick={() => update("favoritesOnly", !filters.favoritesOnly)}
              className={filters.favoritesOnly ? "bevel-in text-[#7d2f55]" : ""}
            >
              {filters.favoritesOnly ? "★" : "☆"} Favorites
            </BevelButton>
          </div>

          <fieldset className="border-t border-[var(--color-line-soft)] pt-2">
            <legend className="label px-1">Tags</legend>
            <div className="space-y-1.5">
              {Object.entries(tagsByKind).map(([kind, tags]) => (
                <div key={kind} className="flex flex-wrap items-center gap-1">
                  <span className="microcopy w-16 shrink-0">{kind}</span>
                  {tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      label={tag.name}
                      active={filters.tagNames.includes(tag.name)}
                      onClick={() => toggleTag(tag.name)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="display text-xs text-[var(--color-accent)]">
          {visible.length} {visible.length === 1 ? "item" : "items"} found
        </p>
        <div className="flex gap-2">
          {filterCount > 0 && (
            <BevelButton onClick={() => setFilters(EMPTY_FILTERS)}>
              ↻ Clear filters
            </BevelButton>
          )}
          <BevelLink href="/add" variant="primary">
            + Add to closet
          </BevelLink>
        </div>
      </div>

      {visible.length === 0 ? (
        <Panel>
          <p className="py-8 text-center text-[var(--color-ink-soft)]">
            {items.length === 0 ? (
              <>
                your closet is empty!!!
                <br />
                <span className="microcopy">
                  add your first piece to get started.
                </span>
              </>
            ) : (
              <>
                nothing here!!!
                <br />
                <span className="microcopy">
                  try fewer filters, or add something new.
                </span>
              </>
            )}
          </p>
        </Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((item) => (
            <li key={item.id}>
              <ItemCard
                item={item}
                onOpen={(item) => setOpenItemId(item.id)}
                onToggleFavorite={toggleFavorite}
              />
            </li>
          ))}
        </ul>
      )}

      {openItem && (
        <ItemDetailModal
          item={openItem}
          allTags={allTags}
          onClose={() => setOpenItemId(null)}
          onToggleFavorite={toggleFavorite}
          onSaved={applyPatch}
          onDeleted={removeItem}
        />
      )}
    </div>
  );
}
