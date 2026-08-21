
/*
# Add unique constraint on entries for composite FK support

## Summary
Adds a unique constraint on entries(id, workspace_id, user_id) so that
other tables can use a composite FK referencing entries that ensures
workspace and user ownership consistency.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entries_id_workspace_user_unique'
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_id_workspace_user_unique
      UNIQUE (id, workspace_id, user_id);
  END IF;
END $$;
