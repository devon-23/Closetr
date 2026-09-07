/**
 * Database types.
 *
 * Hand-written to match supabase/migrations/*.sql so the app typechecks
 * without requiring the Supabase CLI. Once you have the CLI linked, this
 * file can be regenerated instead:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * If you edit a migration, edit this too (or regenerate).
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type ItemRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  color: string | null;
  color_hex: string | null;
  original_image_path: string | null;
  processed_image_path: string | null;
  source_url: string | null;
  source_title: string | null;
  favorite: boolean;
  layout_overrides: Json | null;
};

export type TagRow = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  created_at: string;
};

export type OutfitRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  preview_image_path: string | null;
  favorite: boolean;
};

export type OutfitItemRow = {
  outfit_id: string;
  item_id: string;
  category: string;
  slot: Json;
};

export type WearRow = {
  id: string;
  user_id: string;
  item_id: string | null;
  outfit_id: string | null;
  worn_on: string;
  created_at: string;
};

/** Columns the database fills in for us on insert. */
type Generated = "id" | "created_at" | "updated_at";

/**
 * Shapes one table the way postgrest-js expects.
 *
 * `Relationships` is required — a table missing it fails to satisfy
 * `GenericTable`, and the client then silently resolves every row type
 * to `never` rather than reporting the real problem. We declare no
 * relationships because nothing here uses embedded selects; the queries
 * fetch flat rows and join in application code. Add entries here if you
 * ever write `.select("*, other_table(...)")`.
 */
type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ItemTagRow = { item_id: string; tag_id: string };
type OutfitTagRow = { outfit_id: string; tag_id: string };

export type Database = {
  public: {
    Tables: {
      items: Table<
        ItemRow,
        Omit<ItemRow, Generated> & Partial<Pick<ItemRow, Generated>>,
        Partial<ItemRow>
      >;
      tags: Table<
        TagRow,
        Omit<TagRow, "id" | "created_at"> &
          Partial<Pick<TagRow, "id" | "created_at">>,
        Partial<TagRow>
      >;
      item_tags: Table<ItemTagRow, ItemTagRow, Partial<ItemTagRow>>;
      outfits: Table<
        OutfitRow,
        Omit<OutfitRow, Generated> & Partial<Pick<OutfitRow, Generated>>,
        Partial<OutfitRow>
      >;
      outfit_items: Table<
        OutfitItemRow,
        OutfitItemRow,
        Partial<OutfitItemRow>
      >;
      outfit_tags: Table<OutfitTagRow, OutfitTagRow, Partial<OutfitTagRow>>;
      wears: Table<
        WearRow,
        Omit<WearRow, "id" | "created_at"> &
          Partial<Pick<WearRow, "id" | "created_at">>,
        Partial<WearRow>
      >;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
