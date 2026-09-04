-- ============================================================
-- Domain Separation Step 3: Update functions to reference content_sources
-- ============================================================

-- Drop old semantic_search so we can recreate with new return column names
DROP FUNCTION IF EXISTS public.semantic_search(vector, uuid, integer, uuid);

-- Recreate semantic_search referencing content_sources
CREATE OR REPLACE FUNCTION public.semantic_search(
  query_embedding vector,
  p_workspace_id uuid,
  p_limit integer DEFAULT 10,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE(
  chunk_id uuid,
  content_source_id uuid,
  source_title text,
  source_date date,
  excerpt text,
  similarity real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
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
    public.entry_chunks.content_source_id AS content_source_id,
    public.content_sources.title AS source_title,
    public.content_sources.entry_date AS source_date,
    LEFT(public.entry_chunks.chunk_text, 300) AS excerpt,
    (1 - (public.entry_chunks.embedding <=> query_embedding))::real AS similarity
  FROM public.entry_chunks
  INNER JOIN public.content_sources ON public.content_sources.id = public.entry_chunks.content_source_id
  WHERE public.entry_chunks.workspace_id = p_workspace_id
  AND public.entry_chunks.user_id = (SELECT auth.uid())
  AND public.content_sources.deleted_at IS NULL
  AND public.content_sources.ai_access = 'allowed'
  AND public.entry_chunks.embedding IS NOT NULL
  AND (p_project_id IS NULL OR public.content_sources.project_id = p_project_id)
  ORDER BY public.entry_chunks.embedding <=> query_embedding
  LIMIT p_limit;
END;
$function$;

-- Create new validate_content_source_project function
CREATE OR REPLACE FUNCTION public.validate_content_source_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
$function$;

-- Drop old trigger and recreate with new function
DROP TRIGGER IF EXISTS content_sources_validate_project ON public.content_sources;
CREATE TRIGGER content_sources_validate_project
  BEFORE INSERT OR UPDATE OF project_id, workspace_id, user_id ON public.content_sources
  FOR EACH ROW EXECUTE FUNCTION public.validate_content_source_project();

-- Drop old function
DROP FUNCTION IF EXISTS public.validate_entry_project();

-- Update workspace_entry_count to reference content_sources
CREATE OR REPLACE FUNCTION public.workspace_entry_count(ws_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
select count(*)::integer
from public.content_sources
where public.content_sources.workspace_id = ws_id
and public.content_sources.deleted_at is null
and exists (
  select 1
  from public.workspaces
  where public.workspaces.id = ws_id
  and public.workspaces.user_id = (select auth.uid())
);
$function$;

-- Revoke execute from anon on new functions
REVOKE EXECUTE ON FUNCTION public.validate_content_source_project() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_content_sources_search_vector() FROM anon;
