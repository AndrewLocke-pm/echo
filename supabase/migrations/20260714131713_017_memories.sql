
/*
# Memories table

## Summary
Creates `memories` for storing durable user memories, including AI-suggested
memories from entry processing. AI-created memories always begin as 'suggested'.

## Tables
- `memories`: durable user memories

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- project_id → projects(id) ON DELETE SET NULL (nullable, optional)
- memory_type CHECK: preference, goal, fact, relationship, lesson, project_context, timeline_event, current_state, habit
- status CHECK: suggested, approved, rejected, archived, superseded
- sensitivity CHECK: low, medium, high (default low)
- ai_access CHECK: allowed, blocked (default allowed)
- superseded_by → memories(id) ON DELETE SET NULL (self-referential)
- Unique (user_id, workspace_id, normalised_text) for deduplication
*/

-- First add unique constraint on projects for composite FK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_id_workspace_user_unique'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_id_workspace_user_unique
      UNIQUE (id, workspace_id, user_id);
  END IF;
END $$;

CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  project_id uuid,
  memory_type text NOT NULL,
  memory_text text NOT NULL,
  normalised_text text NOT NULL,
  status text NOT NULL DEFAULT 'suggested',
  confidence real NOT NULL DEFAULT 0.5,
  sensitivity text NOT NULL DEFAULT 'low',
  ai_access text NOT NULL DEFAULT 'allowed',
  last_confirmed_at timestamptz,
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT memories_memory_type_check CHECK (memory_type IN ('preference', 'goal', 'fact', 'relationship', 'lesson', 'project_context', 'timeline_event', 'current_state', 'habit')),
  CONSTRAINT memories_status_check CHECK (status IN ('suggested', 'approved', 'rejected', 'archived', 'superseded')),
  CONSTRAINT memories_sensitivity_check CHECK (sensitivity IN ('low', 'medium', 'high')),
  CONSTRAINT memories_ai_access_check CHECK (ai_access IN ('allowed', 'blocked')),
  CONSTRAINT memories_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT memories_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT memories_project_fk FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE SET NULL,
  CONSTRAINT memories_superseded_by_fk FOREIGN KEY (superseded_by)
    REFERENCES public.memories(id) ON DELETE SET NULL,
  CONSTRAINT memories_user_workspace_normalised_unique UNIQUE (user_id, workspace_id, normalised_text)
);

-- Enable RLS
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_memories" ON public.memories FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_memories" ON public.memories FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_memories" ON public.memories FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_memories" ON public.memories FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX memories_user_id_idx ON public.memories (user_id);
CREATE INDEX memories_workspace_id_idx ON public.memories (workspace_id);
CREATE INDEX memories_project_id_idx ON public.memories (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX memories_status_idx ON public.memories (status);
CREATE INDEX memories_memory_type_idx ON public.memories (memory_type);
CREATE INDEX memories_deleted_at_idx ON public.memories (deleted_at);
CREATE INDEX memories_normalised_text_idx ON public.memories (normalised_text);

-- updated_at trigger
CREATE TRIGGER memories_set_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
