import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, type Category, type Slot } from "@/lib/categories";
import type { ClothingItem, Tag, TagKind } from "@/lib/types";

/**
 * Read side of the closet.
 *
 * Every function here is wrapped in React's `cache`, so a page that needs
 * both the items and the tag list pays for one round of queries per
 * request rather than one per call site.
 */

/** Signed URLs outlive a page render by a wide margin but still expire. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const BUCKET = "closet";

const TAG_KINDS: readonly string[] = [
  "season",
  "occasion",
  "activity",
  "vibe",
  "weather",
  "custom",
];

/**
 * The database column is a plain `text` with a CHECK constraint, so the
 * type system can't know it's narrow. These coerce rather than throw:
 * a row that somehow holds an unknown value should still render.
 */
function toCategory(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value)
    ? (value as Category)
    : "accessories";
}

function toTagKind(value: string): TagKind {
  return TAG_KINDS.includes(value) ? (value as TagKind) : "custom";
}

/**
 * The bucket is private, so paths have to be exchanged for short-lived
 * signed URLs before the browser can load them. One batch call covers
 * the whole closet — signing per item would be ~200 round trips.
 */
async function signPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return signed;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  // A signing failure degrades to the placeholder glyph rather than
  // taking the whole page down.
  if (error || !data) return signed;

  for (const entry of data) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/**
 * The whole closet, tags attached.
 *
 * Three flat queries stitched in memory rather than one nested select.
 * At the scale this app is built for (~100 items) the difference is
 * noise, and it keeps us clear of PostgREST's relationship type
 * inference, which our hand-written `Database` type doesn't describe.
 */
export const getClosetItems = cache(async (): Promise<ClothingItem[]> => {
  const supabase = await createClient();

  const [itemsResult, tagsResult, linksResult] = await Promise.all([
    supabase.from("items").select("*").order("created_at", { ascending: false }),
    supabase.from("tags").select("*"),
    supabase.from("item_tags").select("*"),
  ]);

  if (itemsResult.error) {
    throw new Error(`Failed to load closet: ${itemsResult.error.message}`);
  }

  const rows = itemsResult.data ?? [];
  const tagRows = tagsResult.data ?? [];
  const linkRows = linksResult.data ?? [];

  const tagById = new Map<string, Tag>(
    tagRows.map((row) => [
      row.id,
      { id: row.id, name: row.name, kind: toTagKind(row.kind) },
    ]),
  );

  const tagsByItem = new Map<string, Tag[]>();
  for (const link of linkRows) {
    const tag = tagById.get(link.tag_id);
    if (!tag) continue;
    const list = tagsByItem.get(link.item_id);
    if (list) list.push(tag);
    else tagsByItem.set(link.item_id, [tag]);
  }

  const signed = await signPaths(
    supabase,
    rows.flatMap((row) =>
      [row.processed_image_path, row.original_image_path].filter(
        (path): path is string => Boolean(path),
      ),
    ),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: toCategory(row.category),
    subcategory: row.subcategory,
    color: row.color,
    colorHex: row.color_hex,
    originalImageUrl: row.original_image_path
      ? (signed.get(row.original_image_path) ?? null)
      : null,
    processedImageUrl: row.processed_image_path
      ? (signed.get(row.processed_image_path) ?? null)
      : null,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    favorite: row.favorite,
    tags: (tagsByItem.get(row.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    layoutOverrides: (row.layout_overrides as Partial<Slot> | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
});

/** The user's whole tag vocabulary, including tags nothing uses yet. */
export const getAllTags = cache(async (): Promise<Tag[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load tags: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: toTagKind(row.kind),
  }));
});

/** Counters for the home page. */
export const getClosetSummary = cache(async () => {
  const supabase = await createClient();

  const [items, outfitsResult] = await Promise.all([
    getClosetItems(),
    supabase.from("outfits").select("id", { head: true, count: "exact" }),
  ]);

  return {
    itemCount: items.length,
    favoriteCount: items.filter((item) => item.favorite).length,
    outfitCount: outfitsResult.count ?? 0,
  };
});
