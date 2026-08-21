
/*
# Entities table

## Summary
Creates `entities` for storing extracted entities (people, organisations,
projects, places, topics, systems, dates). Includes deduplication via
unique constraint on (user_id, workspace_id, entity_type, normalised_name).

## Tables
- `entities`: extracted entities per user/workspace

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- entity_type CHECK: person, organisation, project, place, topic, system, date
- Unique (user_id, workspace_id, entity_type, normalised_name)
*/

CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  entity_type text NOT NULL,
  canonical_name text NOT NULL,
  normalised_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entities_entity_type_check CHECK (entity_type IN ('person', 'organisation', 'project', 'place', 'topic', 'system', 'date')),
  CONSTRAINT entities_user_workspace_type_name_unique UNIQUE (user_id, workspace_id, entity_type, normalised_name),
  CONSTRAINT entities_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT
);

-- Enable RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_entities" ON public.entities FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_entities" ON public.entities FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_entities" ON public.entities FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_entities" ON public.entities FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX entities_user_id_idx ON public.entities (user_id);
CREATE INDEX entities_workspace_id_idx ON public.entities (workspace_id);
CREATE INDEX entities_user_workspace_idx ON public.entities (user_id, workspace_id);
CREATE INDEX entities_entity_type_idx ON public.entities (entity_type);
CREATE INDEX entities_normalised_name_idx ON public.entities (normalised_name);

-- updated_at trigger
CREATE TRIGGER entities_set_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
