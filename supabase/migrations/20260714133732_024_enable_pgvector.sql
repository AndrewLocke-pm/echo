
/*
# Enable pgvector and semantic search

## Summary
- Enables the vector extension
- Changes entry_chunks.embedding from jsonb to vector(1536)
  (text-embedding-3-small produces 1536 dimensions)
- Creates a secure semantic search function with auth.uid() boundary
- Creates HNSW index for fast similarity search

## Security
- Function is SECURITY DEFINER with SET search_path = ''
- Uses fully qualified table names
- Verifies workspace ownership via auth.uid()
- Excludes soft-deleted and AI-blocked entries
- Restricted execution grants (authenticated only)
*/

CREATE EXTENSION IF NOT EXISTS vector;

-- Change embedding column from jsonb to vector
-- First drop the old column, then add the new one
ALTER TABLE public.entry_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.entry_chunks ADD COLUMN embedding vector(1536);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX entry_chunks_embedding_idx
  ON public.entry_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Secure semantic search function
CREATE OR REPLACE FUNCTION public.semantic_search(
  query_embedding vector(1536),
  p_workspace_id uuid,
  p_limit integer DEFAULT 10,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  entry_id uuid,
  entry_title text,
  entry_date date,
  excerpt text,
  similarity real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify workspace ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE public.workspaces.id = p_workspace_id
      AND public.workspaces.user_id = (SELECT auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    public.entry_chunks.id AS chunk_id,
    public.entry_chunks.entry_id AS entry_id,
    public.entries.title AS entry_title,
    public.entries.entry_date AS entry_date,
    LEFT(public.entry_chunks.chunk_text, 300) AS excerpt,
    (1 - (public.entry_chunks.embedding <=> query_embedding))::real AS similarity
  FROM public.entry_chunks
  INNER JOIN public.entries ON public.entries.id = public.entry_chunks.entry_id
  WHERE public.entry_chunks.workspace_id = p_workspace_id
    AND public.entry_chunks.user_id = (SELECT auth.uid())
    AND public.entries.deleted_at IS NULL
    AND public.entries.ai_access = 'allowed'
    AND public.entry_chunks.embedding IS NOT NULL
    AND (p_project_id IS NULL OR public.entries.project_id = p_project_id)
  ORDER BY public.entry_chunks.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;

-- Restrict execution
REVOKE EXECUTE ON FUNCTION public.semantic_search(vector(1536), uuid, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.semantic_search(vector(1536), uuid, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.semantic_search(vector(1536), uuid, integer, uuid) TO authenticated;
