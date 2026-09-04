
/*
# Secure workspace_entry_count RPC

## Summary
Replaces the existing workspace_entry_count function with a hardened version
that enforces ownership, uses an empty search_path, fully qualified table names,
and restricts execution to authenticated users only.

## Changes

### workspace_entry_count function
- Changed to SECURITY DEFINER with SET search_path = '' (empty string)
- Uses fully qualified table names (public.workspaces, public.entries)
- Added ownership check: verifies the workspace belongs to auth.uid()
- Returns 0 for workspaces owned by other users or that don't exist
- Excludes soft-deleted entries (deleted_at IS NULL)

### Function execution grants
- REVOKE EXECUTE from PUBLIC (default grant)
- REVOKE EXECUTE from anon
- GRANT EXECUTE to authenticated only

## Security
- The function cannot leak entry counts for other users' workspaces
- The empty search_path prevents search_path hijacking attacks
- Only authenticated users can call the function
- auth.uid() is used for ownership, not a client-supplied user_id
*/

-- ============================================================
-- Replace workspace_entry_count with hardened version
-- ============================================================
create or replace function public.workspace_entry_count(ws_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.entries
  where public.entries.workspace_id = ws_id
    and public.entries.deleted_at is null
    and exists (
      select 1
      from public.workspaces
      where public.workspaces.id = ws_id
        and public.workspaces.user_id = (select auth.uid())
    );
$$;

-- ============================================================
-- Revoke default grants and restrict execution
-- ============================================================
revoke execute on function public.workspace_entry_count(uuid) from public;
revoke execute on function public.workspace_entry_count(uuid) from anon;
grant execute on function public.workspace_entry_count(uuid) to authenticated;
