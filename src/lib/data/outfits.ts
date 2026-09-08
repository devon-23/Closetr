import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, type Category, type Slot } from "@/lib/categories";
import type { Outfit, OutfitItem } from "@/lib/types";

/**
 * Read side of the outfits list.
 *
 * Deliberately does not join the items — the closet is already loaded and
 * cached per request, so the page stitches the two together rather than
 * paying for a second copy of every garment.
 */

function toCategory(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value)
    ? (value as Category)
    : "accessories";
}

/** The column is jsonb, so nothing about its shape is guaranteed on read. */
function toSlot(value: unknown): Slot {
  const raw = (value ?? {}) as Record<string, unknown>;
  const number = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input) ? input : fallback;

  return {
    x: number(raw.x, 50),
    y: number(raw.y, 50),
    scale: number(raw.scale, 0.4),
    z: number(raw.z, 0),
    ...(typeof raw.rotate === "number" && Number.isFinite(raw.rotate)
      ? { rotate: raw.rotate }
      : {}),
  };
}

export const getOutfits = cache(async (): Promise<Outfit[]> => {
  const supabase = await createClient();

  const [outfitsResult, linksResult] = await Promise.all([
    supabase
      .from("outfits")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("outfit_items").select("*"),
  ]);

  if (outfitsResult.error) {
    throw new Error(`Failed to load outfits: ${outfitsResult.error.message}`);
  }

  const piecesByOutfit = new Map<string, OutfitItem[]>();
  for (const row of linksResult.data ?? []) {
    const piece: OutfitItem = {
      itemId: row.item_id,
      category: toCategory(row.category),
      slot: toSlot(row.slot),
    };
    const list = piecesByOutfit.get(row.outfit_id);
    if (list) list.push(piece);
    else piecesByOutfit.set(row.outfit_id, [piece]);
  }

  return (outfitsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    // Previews are rendered live from the pieces; the column exists for a
    // future cached thumbnail and nothing writes it yet.
    previewImageUrl: null,
    items: piecesByOutfit.get(row.id) ?? [],
    tags: [],
    favorite: row.favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
});
