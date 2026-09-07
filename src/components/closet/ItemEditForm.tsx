"use client";

import { useState, useTransition } from "react";
import { BevelButton } from "@/components/ui/BevelButton";
import {
  ItemFields,
  formToPatch,
  itemToForm,
  type ItemFormValue,
} from "@/components/closet/ItemFields";
import { updateItem, type ItemPatch } from "@/app/closet/actions";
import type { ClothingItem, Tag } from "@/lib/types";

type ItemEditFormProps = {
  item: ClothingItem;
  allTags: Tag[];
  /** Called with the saved patch so the list can update without a refetch. */
  onSaved: (patch: ItemPatch) => void;
  onCancel: () => void;
};

export function ItemEditForm({
  item,
  allTags,
  onSaved,
  onCancel,
}: ItemEditFormProps) {
  const [value, setValue] = useState<ItemFormValue>(() => itemToForm(item));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const patch = formToPatch(value);

    startTransition(async () => {
      const result = await updateItem(item.id, patch);
      if (result.ok) onSaved(patch);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <ItemFields value={value} onChange={setValue} allTags={allTags} />

      {error && (
        <p role="alert" className="microcopy text-[var(--color-accent)]">
          couldn&apos;t save: {error}
        </p>
      )}

      <div className="flex justify-between gap-2 border-t border-[var(--color-line-soft)] pt-3">
        <BevelButton onClick={onCancel} disabled={pending}>
          Cancel
        </BevelButton>
        <BevelButton
          variant="primary"
          onClick={save}
          disabled={pending || !value.name.trim()}
        >
          {pending ? "Saving..." : "Save changes"}
        </BevelButton>
      </div>
    </div>
  );
}
