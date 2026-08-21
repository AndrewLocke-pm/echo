
/*
# Milestone 1 Hardening: Workspace Ownership & Deletion Safety

## Summary
Tightens workspace-entry ownership constraints and adds profile default_workspace_id
ownership validation. Changes the entries→workspaces FK from ON DELETE CASCADE
to ON DELETE RESTRICT so permanent workspace deletion is a deliberate act.

## Changes

### 1. entries_workspace_owner_fk: CASCADE → RESTRICT
- The existing composite FK on entries(workspace_id, user_id) → workspaces(id, user_id)
  used ON DELETE CASCADE, meaning deleting a workspace silently destroyed all entries.
- Changed to ON DELETE RESTRICT: the database now refuses to delete a workspace
  that still has entries. The UI must either archive the workspace or the user must
  explicitly handle entry deletion first.
- This prevents accidental data loss from a workspace delete.

### 2. default_workspace_id ownership validation trigger
- The profiles.default_workspace_id FK only references workspaces(id) without
  checking that the workspace belongs to the same user.
- Added a BEFORE INSERT/UPDATE trigger on profiles that verifies
  default_workspace_id belongs to the profile's user_id.
- This prevents a user from setting another user's workspace as their default.

### 3. workspace_entry_count function
- Added a SECURITY DEFINER function workspace_entry_count(workspace_uuid)
  that returns the number of non-deleted entries in a workspace.
- Used by the UI to show how many entries will be affected before deletion.
- Filters by deleted_at IS NULL to show only active entries.

## Security
- No RLS policy changes (existing policies are correct).
- The new trigger prevents cross-user default_workspace_id assignment.
- The RESTRICT FK prevents data loss even if RLS is bypassed by a privileged context.
*/

-- ============================================================
-- 1. Change entries_workspace_owner_fk from CASCADE to RESTRICT
-- ============================================================
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'entries_workspace_owner_fk'
      and conrelid = 'public.entries'::regclass
  ) then
    alter table public.entries drop constraint entries_workspace_owner_fk;
  end if;
end $$;

alter table public.entries
  add constraint entries_workspace_owner_fk
  foreign key (workspace_id, user_id)
  references public.workspaces (id, user_id)
  on delete restrict;

-- ============================================================
-- 2. Validate default_workspace_id ownership on profiles
-- ============================================================
create or replace function public.validate_profile_default_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.default_workspace_id is not null then
    if not exists (
      select 1 from public.workspaces
      where workspaces.id = new.default_workspace_id
        and workspaces.user_id = new.id
    ) then
      raise exception 'default_workspace_id must belong to the profile owner'
        using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_profile_workspace on public.profiles;
create trigger validate_profile_workspace
  before insert or update of default_workspace_id on public.profiles
  for each row execute function public.validate_profile_default_workspace();

-- ============================================================
-- 3. Function: count active entries in a workspace
-- ============================================================
create or replace function public.workspace_entry_count(ws_id uuid)
returns integer language sql security definer set search_path = public as $$
  select count(*)::integer
  from public.entries
  where workspace_id = ws_id
    and deleted_at is null;
$$;
