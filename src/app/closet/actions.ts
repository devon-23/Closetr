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

  const reason = invalidReason(item, user.id);
  if (reason) return FAILED(reason);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .insert(itemRow(item, user.id))
    .select("id")
    .single();

  if (error) return FAILED(error.message);

  const tagsResult = await replaceItemTags(data.id, item.tagNames, user.id);
  if (!tagsResult.ok) {
    // Same reasoning as the batch insert: the caller cleans up the images
    // it uploaded, so a row that survived would be left pointing at none.
    await supabase.from("items").delete().eq("id", data.id);
    return tagsResult;
  }

  refresh();
  return { ok: true, id: data.id };
}

/**
 * Record a whole batch of items whose images the browser has uploaded.
 *
 * Same per-item rules as `createItem`; the batching is what makes a
 * twenty-photo import bearable. The rows go in as one statement so a
 * rejected import leaves no half-built closet behind, and the tag pass
 * resolves every name across the batch at once — two queries instead of
 * three per item.
 */
export async function createItems(
  items: NewItem[],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return FAILED("Not signed in.");
  if (items.length === 0) return { ok: true, ids: [] };

  // Validate everything before writing anything — a batch that fails on
  // item 19 shouldn't have already saved the first eighteen.
  for (const [index, item] of items.entries()) {
    const reason = invalidReason(item, user.id);
    if (reason) return FAILED(`Item ${index + 1}: ${reason}`);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .insert(items.map((item) => itemRow(item, user.id)))
    .select("id");

  if (error) return FAILED(error.message);

  // A multi-row INSERT ... RETURNING comes back in insertion order, which
  // is what lets the tag pass below line these ids up with the input.
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length !== items.length) {
    return FAILED("The database saved a different number of items than sent.");
  }

  const tagsResult = await tagNewItems(ids, items, user.id);
  if (!tagsResult.ok) {
    // Undo the insert. The caller deletes the uploaded images when we
    // report a failure, so rows left behind here would point at objects
    // that no longer exist.
    await supabase.from("items").delete().in("id", ids);
    return tagsResult;
  }

  refresh();
  return { ok: true, ids };
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

/** Field checks shared by the single and batch inserts. Null means fine. */
function invalidReason(item: NewItem, userId: string): string | null {
  if (!item.name.trim()) return "Name can't be empty.";
  if (!(CATEGORIES as readonly string[]).includes(item.category)) {
    return "Unknown category.";
  }

  // The client tells us where it put the files, so verify the paths are
  // inside this user's prefix — otherwise an item could be made to point
  // at somebody else's object.
  for (const path of [item.originalImagePath, item.processedImagePath]) {
    if (path !== null && !path.startsWith(`${userId}/`)) {
      return "Image path didn't belong to you.";
    }
  }

  return null;
}

/** The `items` row for a validated `NewItem`. */
function itemRow(item: NewItem, userId: string) {
  return {
    user_id: userId,
    name: item.name.trim(),
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
  };
}

/** Case-insensitive dedupe that keeps the first spelling seen. */
function dedupe(names: string[]): string[] {
  return [
    ...new Map(
      names
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [name.toLowerCase(), name]),
    ).values(),
  ];
}

/**
 * Map tag names to ids, creating any the user hasn't used before.
 *
 * Matching is case-insensitive to line up with the `lower(name)` unique
 * index — typing "fall" when "Fall" exists has to reuse the row, or the
 * insert trips the constraint.
 */
async function resolveTagIds(
  names: string[],
  userId: string,
): Promise<
  | { ok: true; idByLowerName: Map<string, string> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const wanted = dedupe(names);

  const { data: existingRows, error: readError } = await supabase
    .from("tags")
    .select("id, name");

  if (readError) return FAILED(readError.message);

  const idByLowerName = new Map(
    (existingRows ?? []).map((row) => [row.name.toLowerCase(), row.id]),
  );

  const missing = wanted.filter(
    (name) => !idByLowerName.has(name.toLowerCase()),
  );

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

  return { ok: true, idByLowerName };
}

/** Point an item at exactly `names`, replacing whatever it had. */
async function replaceItemTags(
  itemId: string,
  names: string[],
  userId: string,
): Promise<ActionResult> {
  const resolved = await resolveTagIds(names, userId);
  if (!resolved.ok) return resolved;

  const supabase = await createClient();

  const tagIds = dedupe(names)
    .map((name) => resolved.idByLowerName.get(name.toLowerCase()))
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

/**
 * Tag a freshly-inserted batch, `ids` positionally matching `items`.
 *
 * Unlike `replaceItemTags` there's nothing to clear — these rows are new —
 * so the whole batch collapses into one tag lookup and one link insert.
 */
async function tagNewItems(
  ids: string[],
  items: NewItem[],
  userId: string,
): Promise<ActionResult> {
  const resolved = await resolveTagIds(
    items.flatMap((item) => item.tagNames),
    userId,
  );
  if (!resolved.ok) return resolved;

  const links = ids.flatMap((itemId, index) =>
    dedupe(items[index].tagNames)
      .map((name) => resolved.idByLowerName.get(name.toLowerCase()))
      .filter((tagId): tagId is string => Boolean(tagId))
      .map((tagId) => ({ item_id: itemId, tag_id: tagId })),
  );

  if (links.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("item_tags").insert(links);
  if (error) return FAILED(error.message);

  return { ok: true };
}
