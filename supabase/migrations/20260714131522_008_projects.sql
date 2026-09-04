
/*
# Projects table

## Summary
Creates the `projects` table for organizing entries, notes, and memories
by project. Includes composite workspace ownership FK, RLS, indexes,
and updated_at trigger.

## Tables
- `projects`: user-owned projects within workspaces

## Constraints
- Composite unique (id, user_id, workspace_id)
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- user_id → auth.users(id) ON DELETE CASCADE

## RLS
- SELECT, INSERT, UPDATE, DELETE — all scoped to auth.uid() = user_id
*/

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  start_date date,
  target_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT projects_status_check CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT projects_unique UNIQUE (id, user_id, workspace_id),
  CONSTRAINT projects_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_projects" ON public.projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_projects" ON public.projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_projects" ON public.projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_projects" ON public.projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX projects_user_id_idx ON public.projects (user_id);
CREATE INDEX projects_workspace_id_idx ON public.projects (workspace_id);
CREATE INDEX projects_user_workspace_idx ON public.projects (user_id, workspace_id);
CREATE INDEX projects_status_idx ON public.projects (status);
CREATE INDEX projects_deleted_at_idx ON public.projects (deleted_at);

-- updated_at trigger
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
