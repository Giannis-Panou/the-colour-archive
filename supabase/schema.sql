-- The Colour Archive: Supabase database setup
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to run again; existing tables, policies and the bucket are left as they are.

-- ---------- Tables ----------

create table if not exists public.mixes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 70),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  notes       text not null default '' check (char_length(notes) <= 240),
  -- [{ "name": "Kraken Ink", "brand": "The Army Painter", "drops": "3", "swatch": "#2f4a5f" }, ...]
  paints      jsonb not null default '[]'::jsonb check (jsonb_typeof(paints) = 'array'),
  -- Path of the photo in the mix-photos bucket: "<user id>/<mix id>.jpg", or null for no photo
  image_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mixes_user_id_idx on public.mixes (user_id);

create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 50),
  created_at  timestamptz not null default now()
);
-- Collection names are unique per person, ignoring capitals (matches the app's own check)
create unique index if not exists collections_user_name_idx on public.collections (user_id, lower(name));

-- Which mixes are in which collection. Deleting a mix or a collection removes its links.
create table if not exists public.collection_mixes (
  collection_id uuid not null references public.collections (id) on delete cascade,
  mix_id        uuid not null references public.mixes (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, mix_id)
);
create index if not exists collection_mixes_user_id_idx on public.collection_mixes (user_id);
create index if not exists collection_mixes_mix_id_idx on public.collection_mixes (mix_id);

-- Keep mixes.updated_at current on every edit
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists mixes_set_updated_at on public.mixes;
create trigger mixes_set_updated_at before update on public.mixes
  for each row execute function public.set_updated_at();

-- ---------- Access: signed-in people can only ever see and change their own rows ----------

grant select, insert, update, delete on public.mixes, public.collections, public.collection_mixes to authenticated;
-- Visitors who are not signed in get no table access at all. The row rules below already hide
-- every row from them; this removes the permission underneath as a second layer.
revoke all on public.mixes, public.collections, public.collection_mixes from anon;

alter table public.mixes enable row level security;
alter table public.collections enable row level security;
alter table public.collection_mixes enable row level security;

drop policy if exists "Own mixes: read" on public.mixes;
drop policy if exists "Own mixes: add" on public.mixes;
drop policy if exists "Own mixes: edit" on public.mixes;
drop policy if exists "Own mixes: delete" on public.mixes;
create policy "Own mixes: read" on public.mixes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own mixes: add" on public.mixes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own mixes: edit" on public.mixes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own mixes: delete" on public.mixes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own collections: read" on public.collections;
drop policy if exists "Own collections: add" on public.collections;
drop policy if exists "Own collections: edit" on public.collections;
drop policy if exists "Own collections: delete" on public.collections;
create policy "Own collections: read" on public.collections for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own collections: add" on public.collections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own collections: edit" on public.collections for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own collections: delete" on public.collections for delete to authenticated using ((select auth.uid()) = user_id);

-- A link can only join a collection and a mix that both belong to the same person
drop policy if exists "Own collection links: read" on public.collection_mixes;
drop policy if exists "Own collection links: add" on public.collection_mixes;
drop policy if exists "Own collection links: delete" on public.collection_mixes;
create policy "Own collection links: read" on public.collection_mixes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own collection links: add" on public.collection_mixes for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  and exists (select 1 from public.mixes m where m.id = mix_id and m.user_id = (select auth.uid()))
);
create policy "Own collection links: delete" on public.collection_mixes for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- Photo storage: a private bucket, one folder per person ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mix-photos', 'mix-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Own mix photos: read" on storage.objects;
drop policy if exists "Own mix photos: upload" on storage.objects;
drop policy if exists "Own mix photos: replace" on storage.objects;
drop policy if exists "Own mix photos: delete" on storage.objects;
create policy "Own mix photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'mix-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own mix photos: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'mix-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own mix photos: replace" on storage.objects for update to authenticated
  using (bucket_id = 'mix-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'mix-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own mix photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mix-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
