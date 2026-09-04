
/*
# Entry-to-project linking

## Summary
Adds a composite foreign key from entries to projects, ensuring an entry
can only be linked to a project in the same user and workspace.

## Constraints
- entries(project_id, workspace_id, user_id) → projects(id, workspace_id, user_id)
  ON DELETE SET NULL (unlink project when project is deleted)
- CHECK: project_id can only be set when the entry's workspace matches
  the project's workspace (enforced by composite FK)
- Soft-deleted projects are excluded via a trigger that prevents linking
*/

-- Add composite FK from entries to projects
-- We need a composite FK: entries(project_id, workspace_id, user_id) -> projects(id, workspace_id, user_id)
-- First, add a trigger to validate project_id belongs to same user+workspace and is not soft-deleted

CREATE OR REPLACE FUNCTION public.validate_entry_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.projects
      WHERE public.projects.id = NEW.project_id
        AND public.projects.workspace_id = NEW.workspace_id
        AND public.projects.user_id = NEW.user_id
        AND public.projects.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'project_id must belong to the same user and workspace and not be soft-deleted'
        USING errcode = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Revoke execute from anon and public
REVOKE EXECUTE ON FUNCTION public.validate_entry_project() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_entry_project() FROM anon;

-- Add the trigger
CREATE TRIGGER entries_validate_project
  BEFORE INSERT OR UPDATE OF project_id, workspace_id, user_id ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_entry_project();

-- Add composite FK: entries(project_id, workspace_id, user_id) -> projects(id, workspace_id, user_id)
-- ON DELETE SET NULL so deleting a project unlinks entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entries_project_owner_fk'
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_project_owner_fk
      FOREIGN KEY (project_id, workspace_id, user_id)
      REFERENCES public.projects(id, workspace_id, user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index for project_id lookups on entries
CREATE INDEX IF NOT EXISTS entries_project_id_idx ON public.entries (project_id)
  WHERE project_id IS NOT NULL;
