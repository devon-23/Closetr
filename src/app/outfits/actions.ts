"use server";

import { refresh } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { CATEGORIES, type Category, type Slot } from "@/lib/categories";

/**
 * Outfit mutations.
 *
 * Same posture as the closet actions: a Server Action is reachable by
 * direct POST, so ownership comes from the session and is re-asserted in
 * every WHERE clause. RLS is the backstop, not the only check.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const FAILED = (message: string): { ok: false; error: string } => ({
  ok: false,
  error: message,
});

export type NewOutfitPiece = {
  itemId: string;
  category: Category;
  /** Frozen at save time so the outfit renders the same later. */
  slot: Slot;
};

/** Keeps a hand-posted payload from writing nonsense into the jsonb column. */
function cleanSlot(slot: Slot): Slot | null {
  const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

  if (!slot || !finite(slot.x) || !finite(slot.y)) return null;
  if (!finite(slot.scale) || !finite(slot.z)) return null;

  return {
    x: slot.x,
    y: slot.y,
    scale: slot.scale,
    z: slot.z,
    ...(finite(slot.rotate) ? { rotate: slot.rotate } : {}),
  };
}

/**
 * Save the current dress-up draft as an outfit.
 *
 * The slot each piece resolved to is stored alongside it rather than
 * recomputed on read — that's what lets the default layout be retuned
 * later without rearranging outfits the user already composed.
 */
export async function createOutfit(
  name: string,
  pieces: NewOutfitPiece[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const trimmed = name.trim();
  if (!trimmed) return FAILED("Give the outfit a name.");

  // One row per item — the primary key is (outfit_id, item_id), so a
  // repeated item would trip the constraint rather than being ignored.
  const unique = [
    ...new Map(pieces.map((piece) => [piece.itemId, piece])).values(),
  ];

  if (unique.length === 0) return FAILED("An outfit needs at least one piece.");

  const rows = [];
  for (const piece of unique) {
    if (!(CATEGORIES as readonly string[]).includes(piece.category)) {
      return FAILED("Unknown category.");
    }
    const slot = cleanSlot(piece.slot);
    if (!slot) return FAILED("That outfit's layout didn't make sense.");
    rows.push({ item_id: piece.itemId, category: piece.category, slot });
  }

  const supabase = await createClient();

  // Confirm the items are actually theirs. RLS would refuse the insert
  // anyway, but a foreign-key error is not a sentence anyone can act on.
  const { data: owned, error: readError } = await supabase
    .from("items")
    .select("id")
    .in(
      "id",
      rows.map((row) => row.item_id),
    );

  if (readError) return FAILED(readError.message);
  if ((owned ?? []).length !== rows.length) {
    return FAILED("That outfit refers to an item that isn't in your closet.");
  }

  const { data, error } = await supabase
    .from("outfits")
    .insert({
      user_id: user.id,
      name: trimmed,
      preview_image_path: null,
      favorite: false,
    })
    .select("id")
    .single();

  if (error) return FAILED(error.message);

  const { error: linkError } = await supabase
    .from("outfit_items")
    .insert(rows.map((row) => ({ ...row, outfit_id: data.id })));

  if (linkError) {
    // An outfit with no pieces in it is worse than no outfit.
    await supabase.from("outfits").delete().eq("id", data.id);
    return FAILED(linkError.message);
  }

  refresh();
  return { ok: true, id: data.id };
}

export async function deleteOutfit(outfitId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const supabase = await createClient();

  // outfit_items cascades on delete, so the links go with it.
  const { error } = await supabase
    .from("outfits")
    .delete()
    .eq("id", outfitId)
    .eq("user_id", user.id);

  if (error) return FAILED(error.message);

  refresh();
  return { ok: true };
}

export async function setOutfitFavorite(
  outfitId: string,
  favorite: boolean,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("outfits")
    .update({ favorite })
    .eq("id", outfitId)
    .eq("user_id", user.id);

  if (error) return FAILED(error.message);

  refresh();
  return { ok: true };
}
