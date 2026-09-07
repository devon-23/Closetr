-- ============================================================
-- Seed each new user's tag vocabulary.
--
-- These are starting suggestions, not a fixed taxonomy — they're
-- ordinary rows the user can rename or delete, and custom tags like
-- "Twenty One Pilots" sit alongside them as equals.
-- ============================================================

create or replace function public.seed_default_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tags (user_id, name, kind)
  values
    (new.id, 'Spring', 'season'),
    (new.id, 'Summer', 'season'),
    (new.id, 'Fall', 'season'),
    (new.id, 'Winter', 'season'),

    (new.id, 'Work', 'occasion'),
    (new.id, 'Casual', 'occasion'),
    (new.id, 'Date', 'occasion'),
    (new.id, 'Formal', 'occasion'),
    (new.id, 'Concert', 'occasion'),
    (new.id, 'Travel', 'occasion'),

    (new.id, 'Hiking', 'activity'),
    (new.id, 'Gym', 'activity'),
    (new.id, 'Beach', 'activity'),

    (new.id, 'Cozy', 'vibe'),
    (new.id, 'Y2K', 'vibe'),
    (new.id, 'Streetwear', 'vibe'),
    (new.id, 'Basic', 'vibe'),
    (new.id, 'Fancy', 'vibe'),

    (new.id, 'Hot', 'weather'),
    (new.id, 'Cold', 'weather'),
    (new.id, 'Rain', 'weather'),
    (new.id, 'Snow', 'weather')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_default_tags();
