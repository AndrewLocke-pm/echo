
/*
# Memory sources table

## Summary
Creates `memory_sources` to link every AI-suggested memory to its source entry.
Every AI-suggested memory created from an entry must have a source row.

## Tables
- `memory_sources`: memory ↔ entry source links

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- memory_id → memories(id) ON DELETE CASCADE
- Composite FK (entry_id, workspace_id, user_id) → entries(id, workspace_id, user_id) ON DELETE CASCADE
- Unique (memory_id, entry_id) — one source link per memory+entry pair
*/

-- Add unique constraint on memories for composite FK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memories_id_workspace_user_unique'
  ) THEN
    ALTER TABLE public.memories
      ADD CONSTRAINT memories_id_workspace_user_unique
      UNIQUE (id, workspace_id, user_id);
  END IF;
END $$;

CREATE TABLE public.memory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  source_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT memory_sources_memory_entry_unique UNIQUE (memory_id, entry_id),
  CONSTRAINT memory_sources_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT memory_sources_memory_fk FOREIGN KEY (memory_id, workspace_id, user_id)
    REFERENCES public.memories(id, workspace_id, user_id) ON DELETE CASCADE,
  CONSTRAINT memory_sources_entry_owner_fk FOREIGN KEY (entry_id, workspace_id, user_id)
    REFERENCES public.entries(id, workspace_id, user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.memory_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_memory_sources" ON public.memory_sources FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_memory_sources" ON public.memory_sources FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_memory_sources" ON public.memory_sources FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_memory_sources" ON public.memory_sources FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX memory_sources_user_id_idx ON public.memory_sources (user_id);
CREATE INDEX memory_sources_workspace_id_idx ON public.memory_sources (workspace_id);
CREATE INDEX memory_sources_memory_id_idx ON public.memory_sources (memory_id);
CREATE INDEX memory_sources_entry_id_idx ON public.memory_sources (entry_id);
