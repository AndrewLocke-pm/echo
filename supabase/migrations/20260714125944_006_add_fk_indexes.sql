
/*
# Add indexes for foreign key columns

## Summary
Adds two indexes to support foreign key lookups and eliminate the
"unindexed foreign keys" warning from the Supabase Security Advisor.

## Changes
1. `entries_workspace_owner_idx` on `entries(workspace_id, user_id)` —
   supports the composite FK `entries_workspace_owner_fk` that references
   `workspaces(id, user_id)`. The existing single-column index on
   `workspace_id` alone was insufficient for the composite FK.
2. `profiles_default_workspace_idx` on `profiles(default_workspace_id)` —
   supports the FK `profiles_default_workspace_fk` referencing
   `workspaces(id) ON DELETE SET NULL`. Previously unindexed.
*/

CREATE INDEX IF NOT EXISTS entries_workspace_owner_idx
  ON public.entries (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS profiles_default_workspace_idx
  ON public.profiles (default_workspace_id);
