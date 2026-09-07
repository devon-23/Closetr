-- ============================================================
-- Closetr initial schema
--
-- Single-user in practice, but every row carries user_id and every
-- table has RLS from day one. Retrofitting that onto a populated
-- database is the migration we're avoiding.
-- ============================================================

-- ---------- items -------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null,
  brand text,
  category text not null check (
    category in ('tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories')
  ),
  subcategory text,
  color text,
  color_hex text,

  -- Storage object paths, NOT public URLs. The bucket is private; the
  -- app mints short-lived signed URLs at read time. Storing paths means
  -- rotating buckets or CDNs never requires a data migration.
  original_image_path text,
  processed_image_path text,

  -- Provenance, when an online match was used.
  source_url text,
  source_title text,

  favorite boolean not null default false,

  -- Per-item nudges to the flat-lay slot: {"x":52,"scale":0.44}.
  -- Partial by design — anything absent falls back to the category default.
  layout_overrides jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_created_idx on public.items (user_id, created_at desc);
create index items_user_category_idx on public.items (user_id, category);

-- ---------- tags --------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'custom' check (
    kind in ('season', 'occasion', 'activity', 'vibe', 'weather', 'custom')
  ),
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per user: adding "Fall" when "fall" exists
-- should reuse the tag rather than create a near-duplicate.
create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.item_tags (
  item_id uuid not null references public.items (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (item_id, tag_id)
);

create index item_tags_tag_idx on public.item_tags (tag_id);

-- ---------- outfits -----------------------------------------

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  preview_image_path text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outfits_user_created_idx on public.outfits (user_id, created_at desc);

create table public.outfit_items (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  category text not null,

  -- The resolved slot, frozen at save time. If we later retune the
  -- default layout, previously saved outfits still render as the user
  -- composed them.
  slot jsonb not null,

  primary key (outfit_id, item_id)
);

create index outfit_items_item_idx on public.outfit_items (item_id);

create table public.outfit_tags (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (outfit_id, tag_id)
);

-- ---------- wear history ------------------------------------

-- Empty in V1 and nothing writes to it yet. It exists now because wear
-- history cannot be backfilled — every day without this table is a day
-- of data permanently lost for "most worn", "haven't worn in 6 months",
-- and the outfit calendar.
create table public.wears (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  outfit_id uuid references public.outfits (id) on delete set null,
  worn_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index wears_user_date_idx on public.wears (user_id, worn_on desc);
create index wears_item_idx on public.wears (item_id);

-- ---------- updated_at --------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

create trigger outfits_touch_updated_at
  before update on public.outfits
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Owner-only on every table. Join tables have no user_id of their own,
-- so they check ownership through the parent row.
-- ============================================================

alter table public.items enable row level security;
alter table public.tags enable row level security;
alter table public.item_tags enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.outfit_tags enable row level security;
alter table public.wears enable row level security;

create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tags" on public.tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own outfits" on public.outfits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own wears" on public.wears
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own item_tags" on public.item_tags
  for all using (
    exists (
      select 1 from public.items i
      where i.id = item_tags.item_id and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_tags.item_id and i.user_id = auth.uid()
    )
  );

create policy "own outfit_items" on public.outfit_items
  for all using (
    exists (
      select 1 from public.outfits o
      where o.id = outfit_items.outfit_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.outfits o
      where o.id = outfit_items.outfit_id and o.user_id = auth.uid()
    )
  );

create policy "own outfit_tags" on public.outfit_tags
  for all using (
    exists (
      select 1 from public.outfits o
      where o.id = outfit_tags.outfit_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.outfits o
      where o.id = outfit_tags.outfit_id and o.user_id = auth.uid()
    )
  );

-- ============================================================
-- STORAGE
--
-- One private bucket. Objects are keyed by <user_id>/... so the
-- policies can authorise on the first path segment.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('closet', 'closet', false)
on conflict (id) do nothing;

create policy "own closet objects" on storage.objects
  for all
  using (
    bucket_id = 'closet'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'closet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
