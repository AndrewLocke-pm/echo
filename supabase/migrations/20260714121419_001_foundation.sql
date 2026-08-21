
/*
# Milestone 1 Foundation Migration

Creates profiles, workspaces, and entries tables with RLS, indexes,
full-text search, and auto-profile-creation trigger.
*/

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Helper: update updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Table: profiles
-- ============================================================
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text,
  avatar_url           text,
  preferred_theme      text not null default 'system'
                         check (preferred_theme in ('dark','light','system')),
  default_workspace_id uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- Table: workspaces
-- ============================================================
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  icon        text not null default '📁',
  colour      text not null default '#0d9488',
  is_default  boolean not null default false,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Composite unique for cross-table FK references
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspaces_id_user_id_unique'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_id_user_id_unique unique (id, user_id);
  end if;
end $$;

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- FK from profiles.default_workspace_id to workspaces
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_default_workspace_fk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_default_workspace_fk
      foreign key (default_workspace_id)
      references public.workspaces(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- Trigger: create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Table: entries
-- ============================================================
create table if not exists public.entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id      uuid not null,
  project_id        uuid,
  entry_type        text not null default 'journal'
                      check (entry_type in ('journal','note')),
  title             text not null default '',
  content_text      text not null default '',
  content_json      jsonb,
  entry_date        date not null default current_date,
  tags              text[] not null default '{}',
  ai_access         text not null default 'allowed'
                      check (ai_access in ('allowed','blocked')),
  processing_status text not null default 'not_requested'
                      check (processing_status in
                        ('not_requested','pending','processing','completed','failed','blocked')),
  processing_error  text,
  search_vector     tsvector generated always as (
                      to_tsvector('english',
                        coalesce(title,'') || ' ' || coalesce(content_text,'')
                      )
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Composite FK: workspace must belong to same user
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entries_workspace_owner_fk'
      and conrelid = 'public.entries'::regclass
  ) then
    alter table public.entries
      add constraint entries_workspace_owner_fk
      foreign key (workspace_id, user_id)
      references public.workspaces (id, user_id)
      on delete cascade;
  end if;
end $$;

drop trigger if exists entries_updated_at on public.entries;
create trigger entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists workspaces_user_id_idx      on public.workspaces(user_id);
create index if not exists entries_user_id_idx          on public.entries(user_id);
create index if not exists entries_workspace_id_idx     on public.entries(workspace_id);
create index if not exists entries_user_workspace_idx   on public.entries(user_id, workspace_id);
create index if not exists entries_entry_type_idx       on public.entries(entry_type);
create index if not exists entries_entry_date_idx       on public.entries(entry_date desc);
create index if not exists entries_deleted_at_idx       on public.entries(deleted_at)
  where deleted_at is null;
create index if not exists entries_search_vector_idx    on public.entries using gin(search_vector);

-- ============================================================
-- RLS: profiles
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = id);

-- ============================================================
-- RLS: workspaces
-- ============================================================
alter table public.workspaces enable row level security;

drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own" on public.workspaces
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own" on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own" on public.workspaces
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "workspaces_delete_own" on public.workspaces;
create policy "workspaces_delete_own" on public.workspaces
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS: entries
-- ============================================================
alter table public.entries enable row level security;

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1 from public.workspaces
      where workspaces.id = entries.workspace_id
        and workspaces.user_id = (select auth.uid())
    )
  );

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.workspaces
      where workspaces.id = entries.workspace_id
        and workspaces.user_id = (select auth.uid())
    )
  );

drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);
