
/*
# Entry chunks table

## Summary
Creates `entry_chunks` for storing text chunks of entries for source
retrieval, full-text search, and future embedding generation.

## Tables
- `entry_chunks`: chunked entry content

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- Composite FK (entry_id, workspace_id, user_id) → entries(id, workspace_id, user_id) ON DELETE CASCADE
- Unique (entry_id, chunk_index)
- Generated tsvector search_vector with GIN index
- embedding column reserved for Milestone 4 (nullable, no index yet)
*/

CREATE TABLE public.entry_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  token_count integer NOT NULL DEFAULT 0,
  content_hash text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
  embedding jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entry_chunks_chunk_index_check CHECK (chunk_index >= 0),
  CONSTRAINT entry_chunks_token_count_check CHECK (token_count >= 0),
  CONSTRAINT entry_chunks_entry_chunk_unique UNIQUE (entry_id, chunk_index),
  CONSTRAINT entry_chunks_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT entry_chunks_entry_owner_fk FOREIGN KEY (entry_id, workspace_id, user_id)
    REFERENCES public.entries(id, workspace_id, user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.entry_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_entry_chunks" ON public.entry_chunks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_entry_chunks" ON public.entry_chunks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_entry_chunks" ON public.entry_chunks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_entry_chunks" ON public.entry_chunks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX entry_chunks_user_id_idx ON public.entry_chunks (user_id);
CREATE INDEX entry_chunks_workspace_id_idx ON public.entry_chunks (workspace_id);
CREATE INDEX entry_chunks_entry_id_idx ON public.entry_chunks (entry_id);
CREATE INDEX entry_chunks_user_workspace_idx ON public.entry_chunks (user_id, workspace_id);
CREATE INDEX entry_chunks_search_vector_idx ON public.entry_chunks USING GIN (search_vector);

-- updated_at trigger
CREATE TRIGGER entry_chunks_set_updated_at
  BEFORE UPDATE ON public.entry_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
