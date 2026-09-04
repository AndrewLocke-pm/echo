
/*
# Harden validate_profile_default_workspace trigger function

## Summary
Updates the trigger function to use an empty search_path and fully qualified
table names, matching the security standard applied to workspace_entry_count.

## Changes
- SET search_path = '' (empty string)
- Uses fully qualified public.workspaces table name
- No logic changes
*/

create or replace function public.validate_profile_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_workspace_id is not null then
    if not exists (
      select 1
      from public.workspaces
      where public.workspaces.id = new.default_workspace_id
        and public.workspaces.user_id = new.id
    ) then
      raise exception 'default_workspace_id must belong to the profile owner'
        using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;
