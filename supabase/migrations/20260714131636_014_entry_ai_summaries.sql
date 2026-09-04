
/*
# Entry AI summaries table

## Summary
Creates `entry_ai_summaries` to store AI-generated summaries separately
from original entry content. One current summary per entry and content version.

## Tables
- `entry_ai_summaries`: AI-generated summaries

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- Composite FK (entry_id, workspace_id, user_id) → entries(id, workspace_id, user_id) ON DELETE CASCADE
- Unique (entry_id, source_content_hash) — one summary per content version
*/

CREATE TABLE public.entry_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  summary_text text NOT NULL,
  model_name text NOT NULL,
  prompt_version text NOT NULL DEFAULT '1',
  source_content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entry_ai_summaries_entry_hash_unique UNIQUE (entry_id, source_content_hash),
  CONSTRAINT entry_ai_summaries_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT entry_ai_summaries_entry_owner_fk FOREIGN KEY (entry_id, workspace_id, user_id)
    REFERENCES public.entries(id, workspace_id, user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.entry_ai_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_entry_ai_summaries" ON public.entry_ai_summaries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_entry_ai_summaries" ON public.entry_ai_summaries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_entry_ai_summaries" ON public.entry_ai_summaries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_entry_ai_summaries" ON public.entry_ai_summaries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX entry_ai_summaries_user_id_idx ON public.entry_ai_summaries (user_id);
CREATE INDEX entry_ai_summaries_workspace_id_idx ON public.entry_ai_summaries (workspace_id);
CREATE INDEX entry_ai_summaries_entry_id_idx ON public.entry_ai_summaries (entry_id);

-- updated_at trigger
CREATE TRIGGER entry_ai_summaries_set_updated_at
  BEFORE UPDATE ON public.entry_ai_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
