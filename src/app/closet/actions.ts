"use server";

import { refresh } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { CATEGORIES, type Category } from "@/lib/categories";

/**
 * Closet mutations.
 *
 * Server Actions are reachable by direct POST, so none of these trust
 * the caller for anything but "which row" and "what change". Ownership
 * comes from the session and is re-asserted in the WHERE clause; RLS is
 * the backstop, not the only check.
 */

const BUCKET = "closet";

/** What an action hands back. Deliberately not the raw row. */
export type ActionResult = { ok: true } | { ok: false; error: string };

/** Returns the failure arm specifically, so it fits any result shape. */
const FAILED = (message: string): { ok: false; error: string } => ({
  ok: false,
  error: message,
});

export type ItemPatch = {
  name: string;
  brand: string | null;
  category: Category;
  subcategory: string | null;
  color: string | null;
  colorHex: string | null;
  /** Replaces the item's tags wholesale. Unknown names are created. */
  tagNames: string[];
};

export type NewItem = ItemPatch & {
  /** Storage object paths, already uploaded by the browser. */
  originalImagePath: string | null;
  processedImagePath: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
};

/**
 * Record an item whose images the browser has already uploaded.
 *
 * The images don't come through here: a phone photo blows past the 1MB
 * Server Action body limit, so the client PUTs them straight to Supabase
 * Storage under its own user prefix and hands us the paths.
 */
export async function createItem(
  item: NewItem,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const name = item.name.trim();
  if (!name) return FAILED("Name can't be empty.");
  if (!(CATEGORIES as readonly string[]).includes(item.category)) {
    return FAILED("Unknown category.");
  }

  // The client tells us where it put the files, so verify the paths are
  // inside this user's prefix — otherwise an item could be made to point
  // at somebody else's object.
  for (const path of [item.originalImagePath, item.processedImagePath]) {
    if (path !== null && !path.startsWith(`${user.id}/`)) {
      return FAILED("Image path didn't belong to you.");
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      name,
      brand: blankToNull(item.brand),
      category: item.category,
      subcategory: blankToNull(item.subcategory),
      color: blankToNull(item.color),
      color_hex: blankToNull(item.colorHex),
      original_image_path: item.originalImagePath,
      processed_image_path: item.processedImagePath,
      source_url: blankToNull(item.sourceUrl),
      source_title: blankToNull(item.sourceTitle),
      favorite: false,
      layout_overrides: null,
    })
    .select("id")
    .single();

  if (error) return FAILED(error.message);

  const tagsResult = await replaceItemTags(data.id, item.tagNames, user.id);
  if (!tagsResult.ok) return tagsResult;

  refresh();
  return { ok: true, id: data.id };
}

export async function setFavorite(
  itemId: string,
  favorite: boolean,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ favorite })
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) return FAILED(error.message);

  refresh();
  return { ok: true };
}

export async function updateItem(
  itemId: string,
  patch: ItemPatch,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const name = patch.name.trim();
  if (!name) return FAILED("Name can't be empty.");
  if (!(CATEGORIES as readonly string[]).includes(patch.category)) {
    return FAILED("Unknown category.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("items")
    .update({
      name,
      brand: blankToNull(patch.brand),
      category: patch.category,
      subcategory: blankToNull(patch.subcategory),
      color: blankToNull(patch.color),
      color_hex: blankToNull(patch.colorHex),
    })
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) return FAILED(error.message);

  const tagsResult = await replaceItemTags(itemId, patch.tagNames, user.id);
  if (!tagsResult.ok) return tagsResult;

  refresh();
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");

  const supabase = await createClient();

  // Read the image paths before the row goes away — afterwards there's
  // nothing left to tell us which objects belonged to this item.
  const { data: row } = await supabase
    .from("items")
    .select("original_image_path, processed_image_path")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) return FAILED("That item no longer exists.");

  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) return FAILED(error.message);

  // Best effort. An orphaned object wastes a little quota; a failure
  // here shouldn't make a successful delete look broken to the user.
  const paths = [row.original_image_path, row.processed_image_path].filter(
    (path): path is string => Boolean(path),
  );
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }

  refresh();
  return { ok: true };
}

/* ---------- helpers ---------------------------------------- */

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Point an item at exactly `names`, creating any tag the user hasn't
 * used before.
 *
 * Matching is case-insensitive to line up with the `lower(name)` unique
 * index — typing "fall" when "Fall" exists has to reuse the row, or the
 * insert trips the constraint.
 */
async function replaceItemTags(
  itemId: string,
  names: string[],
  userId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const wanted = [
    ...new Map(
      names
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [name.toLowerCase(), name]),
    ).values(),
  ];

  const { data: existingRows, error: readError } = await supabase
    .from("tags")
    .select("id, name");

  if (readError) return FAILED(readError.message);

  const idByLowerName = new Map(
    (existingRows ?? []).map((row) => [row.name.toLowerCase(), row.id]),
  );

  const missing = wanted.filter((name) => !idByLowerName.has(name.toLowerCase()));

  if (missing.length > 0) {
    const { data: created, error: insertError } = await supabase
      .from("tags")
      .insert(
        missing.map((name) => ({ user_id: userId, name, kind: "custom" })),
      )
      .select("id, name");

    if (insertError) return FAILED(insertError.message);

    for (const row of created ?? []) {
      idByLowerName.set(row.name.toLowerCase(), row.id);
    }
  }

  const tagIds = wanted
    .map((name) => idByLowerName.get(name.toLowerCase()))
    .filter((id): id is string => Boolean(id));

  const { error: clearError } = await supabase
    .from("item_tags")
    .delete()
    .eq("item_id", itemId);

  if (clearError) return FAILED(clearError.message);

  if (tagIds.length > 0) {
    const { error: linkError } = await supabase
      .from("item_tags")
      .insert(tagIds.map((tagId) => ({ item_id: itemId, tag_id: tagId })));

    if (linkError) return FAILED(linkError.message);
  }

  return { ok: true };
}
