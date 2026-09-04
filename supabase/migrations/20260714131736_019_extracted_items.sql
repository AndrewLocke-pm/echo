
/*
# Extracted items table

## Summary
Creates `extracted_items` for storing decisions, commitments, concerns,
questions, tasks, and ideas extracted from entries by AI.

## Tables
- `extracted_items`: structured items extracted from entries

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- project_id → projects(id) ON DELETE SET NULL (nullable, optional)
- Composite FK (entry_id, workspace_id, user_id) → entries(id, workspace_id, user_id) ON DELETE CASCADE
- assigned_entity_id → entities(id) ON DELETE SET NULL (nullable, optional)
- item_type CHECK: decision, commitment, concern, question, task, idea
- status CHECK: open, resolved, completed, dismissed, archived
- confidence CHECK: 0 to 1
*/

CREATE TABLE public.extracted_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  project_id uuid,
  entry_id uuid NOT NULL,
  item_type text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  due_date date,
  assigned_entity_id uuid,
  confidence real NOT NULL DEFAULT 0.5,
  source_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT extracted_items_item_type_check CHECK (item_type IN ('decision', 'commitment', 'concern', 'question', 'task', 'idea')),
  CONSTRAINT extracted_items_status_check CHECK (status IN ('open', 'resolved', 'completed', 'dismissed', 'archived')),
  CONSTRAINT extracted_items_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT extracted_items_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT extracted_items_project_fk FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE SET NULL,
  CONSTRAINT extracted_items_entry_owner_fk FOREIGN KEY (entry_id, workspace_id, user_id)
    REFERENCES public.entries(id, workspace_id, user_id) ON DELETE CASCADE,
  CONSTRAINT extracted_items_assigned_entity_fk FOREIGN KEY (assigned_entity_id)
    REFERENCES public.entities(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.extracted_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_extracted_items" ON public.extracted_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_extracted_items" ON public.extracted_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_extracted_items" ON public.extracted_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_extracted_items" ON public.extracted_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX extracted_items_user_id_idx ON public.extracted_items (user_id);
CREATE INDEX extracted_items_workspace_id_idx ON public.extracted_items (workspace_id);
CREATE INDEX extracted_items_project_id_idx ON public.extracted_items (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX extracted_items_entry_id_idx ON public.extracted_items (entry_id);
CREATE INDEX extracted_items_item_type_idx ON public.extracted_items (item_type);
CREATE INDEX extracted_items_status_idx ON public.extracted_items (status);
CREATE INDEX extracted_items_deleted_at_idx ON public.extracted_items (deleted_at);

-- updated_at trigger
CREATE TRIGGER extracted_items_set_updated_at
  BEFORE UPDATE ON public.extracted_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
