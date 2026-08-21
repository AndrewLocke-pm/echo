
/*
# Entry entities link table

## Summary
Creates `entry_entities` to link entries to extracted entities.
Prevents duplicate links between the same entry and entity.
Enforces ownership consistency for both entry and entity.

## Tables
- `entry_entities`: entry ↔ entity links

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- Composite FK (entry_id, workspace_id, user_id) → entries(id, workspace_id, user_id) ON DELETE CASCADE
- Composite FK (entity_id, workspace_id, user_id) → entities(id, workspace_id, user_id) ON DELETE CASCADE
  (requires unique constraint on entities(id, workspace_id, user_id))
- Unique (entry_id, entity_id)
- confidence CHECK: 0 to 1
*/

-- First add unique constraint on entities for composite FK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entities_id_workspace_user_unique'
  ) THEN
    ALTER TABLE public.entities
      ADD CONSTRAINT entities_id_workspace_user_unique
      UNIQUE (id, workspace_id, user_id);
  END IF;
END $$;

CREATE TABLE public.entry_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  source_excerpt text,
  confidence real NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entry_entities_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT entry_entities_entry_entity_unique UNIQUE (entry_id, entity_id),
  CONSTRAINT entry_entities_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT entry_entities_entry_owner_fk FOREIGN KEY (entry_id, workspace_id, user_id)
    REFERENCES public.entries(id, workspace_id, user_id) ON DELETE CASCADE,
  CONSTRAINT entry_entities_entity_owner_fk FOREIGN KEY (entity_id, workspace_id, user_id)
    REFERENCES public.entities(id, workspace_id, user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.entry_entities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_entry_entities" ON public.entry_entities FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_entry_entities" ON public.entry_entities FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_entry_entities" ON public.entry_entities FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_entry_entities" ON public.entry_entities FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX entry_entities_user_id_idx ON public.entry_entities (user_id);
CREATE INDEX entry_entities_workspace_id_idx ON public.entry_entities (workspace_id);
CREATE INDEX entry_entities_entry_id_idx ON public.entry_entities (entry_id);
CREATE INDEX entry_entities_entity_id_idx ON public.entry_entities (entity_id);
