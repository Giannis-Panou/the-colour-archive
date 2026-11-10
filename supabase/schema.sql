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

-- ---------- Short share links: /s/<10-character code> ----------
-- A share is a frozen snapshot of a mix or collection. Only its creator can add or remove it;
-- anyone with the exact code can open it through get_share(), but nobody can list shares.

create table if not exists public.shares (
  id          text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload     jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  created_at  timestamptz not null default now()
);
create index if not exists shares_user_id_idx on public.shares (user_id);

grant select, insert, update, delete on public.shares to authenticated;
revoke all on public.shares from anon;
alter table public.shares enable row level security;

drop policy if exists "Own shares: read" on public.shares;
drop policy if exists "Own shares: add" on public.shares;
drop policy if exists "Own shares: edit" on public.shares;
drop policy if exists "Own shares: delete" on public.shares;
create policy "Own shares: read" on public.shares for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own shares: add" on public.shares for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own shares: edit" on public.shares for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own shares: delete" on public.shares for delete to authenticated using ((select auth.uid()) = user_id);

-- Opens one share by its exact code. Runs with the table owner's rights so visitors can read a
-- single snapshot without any permission to browse the table.
create or replace function public.get_share(share_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select payload from public.shares where id = share_id;
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;

-- Photos in shares are copies in a public bucket, one folder per share code.
-- Anyone with a share link can see its photos; only the share's creator can add or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-photos', 'share-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Share photos: owner reads" on storage.objects;
drop policy if exists "Share photos: owner uploads" on storage.objects;
drop policy if exists "Share photos: owner deletes" on storage.objects;
create policy "Share photos: owner reads" on storage.objects for select to authenticated using (
  bucket_id = 'share-photos'
  and exists (select 1 from public.shares s where s.id = (storage.foldername(name))[1] and s.user_id = (select auth.uid()))
);
create policy "Share photos: owner uploads" on storage.objects for insert to authenticated with check (
  bucket_id = 'share-photos'
  and exists (select 1 from public.shares s where s.id = (storage.foldername(name))[1] and s.user_id = (select auth.uid()))
);
create policy "Share photos: owner deletes" on storage.objects for delete to authenticated using (
  bucket_id = 'share-photos'
  and exists (select 1 from public.shares s where s.id = (storage.foldername(name))[1] and s.user_id = (select auth.uid()))
);

-- ---------- Workshop: favourites, My paints, recipes and projects ----------
-- Added with recipes, projects and the shopping list. Safe to run on a database that already has
-- everything above: it only adds what's missing.

alter table public.mixes add column if not exists favorite boolean not null default false;

-- The paints someone owns ("have", "low") or wants ("want"). One entry per brand and name.
create table if not exists public.paints (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 50),
  brand       text not null default '' check (char_length(brand) <= 40),
  swatch      text not null check (swatch ~ '^#[0-9a-fA-F]{6}$'),
  status      text not null default 'have' check (status in ('have', 'low', 'want')),
  created_at  timestamptz not null default now()
);
create unique index if not exists paints_user_brand_name_idx on public.paints (user_id, lower(btrim(brand)), lower(btrim(name)));

-- A paint scheme. steps: [{ "role": "Base", "mixId": "<mix id>" | null, "paint": "Nuln Oil", "note": "" }, ...]
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 70),
  notes       text not null default '' check (char_length(notes) <= 500),
  steps       jsonb not null default '[]'::jsonb check (
    jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 30 and octet_length(steps::text) <= 20000
  ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists recipes_user_id_idx on public.recipes (user_id);

-- True when every photo in a project's list is stored in its owner's own folder.
create or replace function public.photos_in_own_folder(photos jsonb, owner uuid) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(photo ->> 'path' like owner::text || '/%'), true)
  from jsonb_array_elements(photos) as photo;
$$;

-- A model or army. photos: [{ "id": "...", "path": "<user id>/project-<id>-....jpg", "caption": "", "added_at": "..." }]
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 70),
  notes       text not null default '' check (char_length(notes) <= 500),
  recipe_ids  jsonb not null default '[]'::jsonb check (jsonb_typeof(recipe_ids) = 'array' and jsonb_array_length(recipe_ids) <= 200),
  mix_ids     jsonb not null default '[]'::jsonb check (jsonb_typeof(mix_ids) = 'array' and jsonb_array_length(mix_ids) <= 500),
  photos      jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 12),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_photos_own_folder check (public.photos_in_own_folder(photos, user_id))
);
create index if not exists projects_user_id_idx on public.projects (user_id);

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.paints, public.recipes, public.projects to authenticated;
revoke all on public.paints, public.recipes, public.projects from anon;
alter table public.paints enable row level security;
alter table public.recipes enable row level security;
alter table public.projects enable row level security;

drop policy if exists "Own paints: read" on public.paints;
drop policy if exists "Own paints: add" on public.paints;
drop policy if exists "Own paints: edit" on public.paints;
drop policy if exists "Own paints: delete" on public.paints;
create policy "Own paints: read" on public.paints for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own paints: add" on public.paints for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own paints: edit" on public.paints for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own paints: delete" on public.paints for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own recipes: read" on public.recipes;
drop policy if exists "Own recipes: add" on public.recipes;
drop policy if exists "Own recipes: edit" on public.recipes;
drop policy if exists "Own recipes: delete" on public.recipes;
create policy "Own recipes: read" on public.recipes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own recipes: add" on public.recipes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own recipes: edit" on public.recipes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own recipes: delete" on public.recipes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own projects: read" on public.projects;
drop policy if exists "Own projects: add" on public.projects;
drop policy if exists "Own projects: edit" on public.projects;
drop policy if exists "Own projects: delete" on public.projects;
create policy "Own projects: read" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own projects: add" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own projects: edit" on public.projects for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own projects: delete" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);
