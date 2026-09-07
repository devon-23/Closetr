"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { GarmentGlyph } from "@/components/ui/GarmentGlyph";
import { BevelButton } from "@/components/ui/BevelButton";
import { StarToggle } from "@/components/ui/StarToggle";
import { TagChip } from "@/components/ui/TagChip";
import { ItemEditForm } from "@/components/closet/ItemEditForm";
import { CATEGORY_LABELS } from "@/lib/categories";
import { deleteItem, type ItemPatch } from "@/app/closet/actions";
import type { ClothingItem, Tag } from "@/lib/types";

type ItemDetailModalProps = {
  item: ClothingItem;
  allTags: Tag[];
  onClose: () => void;
  onToggleFavorite: (item: ClothingItem) => void;
  onSaved: (item: ClothingItem, patch: ItemPatch) => void;
  onDeleted: (item: ClothingItem) => void;
};

type Mode = "view" | "edit" | "confirm-delete";

/**
 * Uses the native <dialog> element, which gives us a real focus trap,
 * Escape-to-close, and inert background content for free — all things
 * that are easy to get wrong hand-rolling a modal.
 */
export function ItemDetailModal({
  item,
  allTags,
  onClose,
  onToggleFavorite,
  onSaved,
  onDeleted,
}: ItemDetailModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const rows: [string, string | null][] = [
    ["Brand", item.brand],
    ["Category", CATEGORY_LABELS[item.category]],
    ["Subcategory", item.subcategory],
    ["Color", item.color],
    [
      "Added",
      new Date(item.createdAt).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      }),
    ],
  ];

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (result.ok) {
        onDeleted(item);
        ref.current?.close();
      } else {
        setError(result.error);
        setMode("view");
      }
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="item-modal-title"
      className="panel m-auto w-[min(28rem,calc(100vw-2rem))] p-0 backdrop:bg-[rgba(43,37,51,0.45)]"
    >
      <header className="panel-titlebar">
        <h2 id="item-modal-title" className="truncate">
          {mode === "edit" ? `Editing ${item.name}` : item.name}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close"
          className="bevel cursor-pointer px-1.5 leading-none text-[var(--color-ink)]"
        >
          ×
        </button>
      </header>

      <div className="p-4">
        {mode === "edit" ? (
          <ItemEditForm
            item={item}
            allTags={allTags}
            onCancel={() => setMode("view")}
            onSaved={(patch) => {
              onSaved(item, patch);
              setMode("view");
            }}
          />
        ) : (
          <>
            <div className="flex aspect-4/3 items-center justify-center border border-[var(--color-line-soft)] bg-[var(--color-paper-alt)] p-4">
              {item.processedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.processedImageUrl}
                  alt={item.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <GarmentGlyph
                  category={item.category}
                  color={item.colorHex}
                  className="h-full w-full"
                />
              )}
            </div>

            <dl className="mt-3 divide-y divide-[var(--color-line-soft)]">
              {rows
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-1">
                    <dt className="label">{label}</dt>
                    <dd className="text-right text-[12px]">{value}</dd>
                  </div>
                ))}
            </dl>

            {item.tags.length > 0 && (
              <div className="mt-3">
                <p className="label mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <TagChip key={tag.id} label={tag.name} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-1 border-t border-[var(--color-line-soft)] pt-2">
              <StarToggle
                favorite={item.favorite}
                itemName={item.name}
                onToggle={() => onToggleFavorite(item)}
              />
              <span className="label">
                {item.favorite ? "Favorited" : "Add to favorites"}
              </span>
            </div>

            {item.sourceUrl && (
              <p className="microcopy mt-2">
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  view source ↗
                </a>
              </p>
            )}

            {error && (
              <p role="alert" className="microcopy mt-2 text-[var(--color-accent)]">
                {error}
              </p>
            )}

            {mode === "confirm-delete" ? (
              <div className="mt-4 border-t border-[var(--color-line-soft)] pt-3">
                <p className="text-center text-[12px]">
                  delete <strong>{item.name}</strong> for good?
                  <br />
                  <span className="microcopy">this can&apos;t be undone.</span>
                </p>
                <div className="mt-3 flex justify-between gap-2">
                  <BevelButton
                    onClick={() => setMode("view")}
                    disabled={pending}
                  >
                    Never mind
                  </BevelButton>
                  <BevelButton
                    variant="primary"
                    onClick={confirmDelete}
                    disabled={pending}
                  >
                    {pending ? "Deleting..." : "Yes, delete it"}
                  </BevelButton>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex justify-between gap-2 border-t border-[var(--color-line-soft)] pt-3">
                <BevelButton onClick={() => setMode("edit")}>Edit</BevelButton>
                <BevelButton onClick={() => setMode("confirm-delete")}>
                  Delete
                </BevelButton>
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
