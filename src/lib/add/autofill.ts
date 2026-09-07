import { CATEGORIES, type Category } from "@/lib/categories";
import {
  EMPTY_ITEM_FORM,
  type ItemFormValue,
} from "@/components/closet/ItemFields";

/**
 * Ask `/api/metadata` what a garment is and shape the answer into form
 * state.
 *
 * Best effort by design — every failure path returns a usable form with
 * a human-readable notice, because the fallback ("type it in yourself")
 * is perfectly fine and much better than a dead end. The route already
 * validates the model's output; this only has to survive the transport.
 */

export type AutofillResult = {
  value: ItemFormValue;
  /** Non-null when the fields came back empty and why. */
  notice: string | null;
};

const GENERIC_FAILURE = "auto-fill didn't work — fill it in yourself.";

export async function autofillFields(
  visionBase64: string,
  swatch: string | null,
): Promise<AutofillResult> {
  // A measured swatch is worth keeping even when nothing else arrives.
  const blank = (notice: string | null): AutofillResult => ({
    value: swatch ? { ...EMPTY_ITEM_FORM, colorHex: swatch } : EMPTY_ITEM_FORM,
    notice,
  });

  try {
    const response = await fetch("/api/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: visionBase64,
        mediaType: "image/jpeg",
      }),
    });

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      return blank(error ?? GENERIC_FAILURE);
    }

    const filled = await response.json();

    return {
      value: {
        name: filled.name ?? "",
        brand: filled.brand ?? "",
        category: (CATEGORIES as readonly string[]).includes(filled.category)
          ? (filled.category as Category)
          : "tops",
        subcategory: filled.subcategory ?? "",
        color: filled.color ?? "",
        // Prefer the colour measured off the actual pixels; Claude's hex is
        // a description of a colour, this one is the colour.
        colorHex: swatch ?? filled.colorHex ?? "",
        tagNames: Array.isArray(filled.tags) ? filled.tags : [],
      },
      notice: null,
    };
  } catch {
    return blank(GENERIC_FAILURE);
  }
}
