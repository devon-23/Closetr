"use client";

import { useState } from "react";
import { BevelButton } from "@/components/ui/BevelButton";
import { Select } from "@/components/ui/Select";
import { TagChip } from "@/components/ui/TagChip";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SUBCATEGORIES,
  type Category,
} from "@/lib/categories";
import type { ItemPatch } from "@/app/closet/actions";
import type { ClothingItem, Tag } from "@/lib/types";

/**
 * The item form fields, shared by the add flow and the edit modal.
 *
 * Everything is a plain string here rather than `string | null` — a
 * controlled input can't hold null — and the null-ing happens once, in
 * `formToPatch`, on the way to the server.
 */

export type ItemFormValue = {
  name: string;
  brand: string;
  category: Category;
  subcategory: string;
  color: string;
  /** Empty means "no swatch chosen", which is different from a grey one. */
  colorHex: string;
  tagNames: string[];
};

export const EMPTY_ITEM_FORM: ItemFormValue = {
  name: "",
  brand: "",
  category: "tops",
  subcategory: "",
  color: "",
  colorHex: "",
  tagNames: [],
};

export function itemToForm(item: ClothingItem): ItemFormValue {
  return {
    name: item.name,
    brand: item.brand ?? "",
    category: item.category,
    subcategory: item.subcategory ?? "",
    color: item.color ?? "",
    colorHex: item.colorHex ?? "",
    tagNames: item.tags.map((tag) => tag.name),
  };
}

export function formToPatch(value: ItemFormValue): ItemPatch {
  return {
    name: value.name,
    brand: value.brand || null,
    category: value.category,
    // A subcategory left over from a different category would be nonsense.
    subcategory: SUBCATEGORIES[value.category].includes(value.subcategory)
      ? value.subcategory
      : null,
    color: value.color || null,
    colorHex: value.color ? value.colorHex || null : null,
    tagNames: value.tagNames,
  };
}

type ItemFieldsProps = {
  value: ItemFormValue;
  onChange: (value: ItemFormValue) => void;
  allTags: Tag[];
};

export function ItemFields({ value, onChange, allTags }: ItemFieldsProps) {
  const [newTag, setNewTag] = useState("");

  const set = <K extends keyof ItemFormValue>(
    key: K,
    next: ItemFormValue[K],
  ) => onChange({ ...value, [key]: next });

  const unused = allTags.filter(
    (tag) =>
      !value.tagNames.some(
        (name) => name.toLowerCase() === tag.name.toLowerCase(),
      ),
  );

  function addTag(candidate: string) {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const exists = value.tagNames.some(
      (name) => name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!exists) set("tagNames", [...value.tagNames, trimmed]);
    setNewTag("");
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="flex flex-col gap-0.5">
          <span className="label">Name</span>
          <input
            value={value.name}
            onChange={(event) => set("name", event.target.value)}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="label">Brand</span>
          <input
            value={value.brand}
            onChange={(event) => set("brand", event.target.value)}
            placeholder="none"
            className="field"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Category"
            value={value.category}
            onChange={(next) =>
              onChange({
                ...value,
                category: next as Category,
                subcategory: "",
              })
            }
            options={CATEGORIES.map((category) => ({
              value: category,
              label: CATEGORY_LABELS[category],
            }))}
          />
          <Select
            label="Subcategory"
            value={value.subcategory}
            onChange={(next) => set("subcategory", next)}
            placeholder="Any"
            options={SUBCATEGORIES[value.category].map((option) => ({
              value: option,
              label: option,
            }))}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-0.5">
            <span className="label">Color</span>
            <input
              value={value.color}
              onChange={(event) => set("color", event.target.value)}
              placeholder="none"
              className="field"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="label">Swatch</span>
            <input
              type="color"
              value={value.colorHex || "#cccccc"}
              onChange={(event) => set("colorHex", event.target.value)}
              disabled={!value.color}
              aria-label="Color swatch"
              className="bevel-in h-[26px] w-12 cursor-pointer bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </label>
        </div>
      </div>

      <fieldset className="border-t border-[var(--color-line-soft)] pt-2">
        <legend className="label px-1">Tags</legend>

        <div className="flex flex-wrap gap-1">
          {value.tagNames.length === 0 && (
            <span className="microcopy">no tags yet</span>
          )}
          {value.tagNames.map((tagName) => (
            <TagChip
              key={tagName}
              label={tagName}
              active
              onRemove={() =>
                set(
                  "tagNames",
                  value.tagNames.filter((name) => name !== tagName),
                )
              }
            />
          ))}
        </div>

        <div className="mt-2 flex gap-1">
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag(newTag);
              }
            }}
            placeholder="add a tag..."
            aria-label="Add a tag"
            className="field"
          />
          <BevelButton onClick={() => addTag(newTag)}>+</BevelButton>
        </div>

        {unused.length > 0 && (
          <div className="mt-2">
            <p className="microcopy mb-1">or pick one you already use:</p>
            <div className="flex flex-wrap gap-1">
              {unused.map((tag) => (
                <TagChip
                  key={tag.id}
                  label={tag.name}
                  onClick={() => addTag(tag.name)}
                />
              ))}
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
