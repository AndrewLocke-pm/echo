-- ============================================================
-- Domain Separation Step 1: Rename entries → content_sources, add source_type, create subtype tables
-- ============================================================

-- Step 1: Rename entries table
ALTER TABLE public.entries RENAME TO content_sources;

-- Rename indexes on the renamed table
ALTER INDEX IF EXISTS entries_pkey RENAME TO content_sources_pkey;
ALTER INDEX IF EXISTS entries_id_workspace_user_unique RENAME TO content_sources_id_workspace_user_unique;
ALTER INDEX IF EXISTS entries_workspace_id_user_id_idx RENAME TO content_sources_workspace_id_user_id_idx;
ALTER INDEX IF EXISTS entries_project_id_workspace_id_user_id_idx RENAME TO content_sources_project_id_workspace_id_user_id_idx;
ALTER INDEX IF EXISTS entries_search_vector_idx RENAME TO content_sources_search_vector_idx;
ALTER INDEX IF EXISTS entries_entry_date_idx RENAME TO content_sources_entry_date_idx;
ALTER INDEX IF EXISTS entries_deleted_at_idx RENAME TO content_sources_deleted_at_idx;
ALTER INDEX IF EXISTS entries_processing_status_idx RENAME TO content_sources_processing_status_idx;
ALTER INDEX IF EXISTS entries_ai_access_idx RENAME TO content_sources_ai_access_idx;

-- Rename triggers
ALTER TRIGGER entries_updated_at ON public.content_sources RENAME TO content_sources_updated_at;
ALTER TRIGGER entries_validate_project ON public.content_sources RENAME TO content_sources_validate_project;

-- Rename constraints on content_sources
ALTER TABLE public.content_sources RENAME CONSTRAINT entries_entry_type_check TO content_sources_entry_type_check;
ALTER TABLE public.content_sources RENAME CONSTRAINT entries_ai_access_check TO content_sources_ai_access_check;
ALTER TABLE public.content_sources RENAME CONSTRAINT entries_processing_status_check TO content_sources_processing_status_check;

-- Drop old RLS policies (they still have old names after table rename)
DROP POLICY IF EXISTS entries_select_own ON public.content_sources;
DROP POLICY IF EXISTS entries_insert_own ON public.content_sources;
DROP POLICY IF EXISTS entries_update_own ON public.content_sources;
DROP POLICY IF EXISTS entries_delete_own ON public.content_sources;

-- Recreate RLS policies with new names
CREATE POLICY "content_sources_select_own" ON public.content_sources
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

CREATE POLICY "content_sources_insert_own" ON public.content_sources
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = content_sources.workspace_id
      AND workspaces.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "content_sources_update_own" ON public.content_sources
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = content_sources.workspace_id
      AND workspaces.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "content_sources_delete_own" ON public.content_sources
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Step 2: Add source_type column
ALTER TABLE public.content_sources ADD COLUMN source_type text NOT NULL DEFAULT 'journal';

-- Migrate source_type from entry_type: 'note' → 'knowledge', 'journal' → 'journal'
UPDATE public.content_sources SET source_type = CASE WHEN entry_type = 'note' THEN 'knowledge' ELSE 'journal' END;

-- Add CHECK constraint for source_type
ALTER TABLE public.content_sources ADD CONSTRAINT content_sources_source_type_check
  CHECK (source_type IN ('journal', 'knowledge'));

-- Step 3: Create journal_entries subtype table
CREATE TABLE public.journal_entries (
  content_source_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  mood text,
  weather text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_source_id),
  FOREIGN KEY (content_source_id) REFERENCES public.content_sources(id) ON DELETE CASCADE
);

-- Step 4: Create knowledge_documents subtype table
CREATE TABLE public.knowledge_documents (
  content_source_id uuid NOT NULL,
  document_type text NOT NULL DEFAULT 'note',
  category text,
  status text NOT NULL DEFAULT 'active',
  last_reviewed_at timestamptz,
  review_due_at date,
  allow_memory_extraction boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_source_id),
  FOREIGN KEY (content_source_id) REFERENCES public.content_sources(id) ON DELETE CASCADE,
  CONSTRAINT knowledge_documents_document_type_check
    CHECK (document_type IN ('note', 'reference', 'guide', 'spec', 'research', 'bookmark')),
  CONSTRAINT knowledge_documents_status_check
    CHECK (status IN ('active', 'archived', 'draft'))
);

-- Step 5: Migrate existing data
INSERT INTO public.journal_entries (content_source_id, entry_date)
SELECT id, entry_date FROM public.content_sources WHERE source_type = 'journal'
ON CONFLICT (content_source_id) DO NOTHING;

INSERT INTO public.knowledge_documents (content_source_id)
SELECT id FROM public.content_sources WHERE source_type = 'knowledge'
ON CONFLICT (content_source_id) DO NOTHING;

-- Enable RLS on subtype tables
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

-- RLS for journal_entries (ownership via content_sources)
CREATE POLICY "select_own_journal_entries" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.journal_entries.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "insert_own_journal_entries" ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.journal_entries.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "update_own_journal_entries" ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.journal_entries.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.journal_entries.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "delete_own_journal_entries" ON public.journal_entries
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.journal_entries.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

-- RLS for knowledge_documents (ownership via content_sources)
CREATE POLICY "select_own_knowledge_documents" ON public.knowledge_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.knowledge_documents.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "insert_own_knowledge_documents" ON public.knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.knowledge_documents.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "update_own_knowledge_documents" ON public.knowledge_documents
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.knowledge_documents.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.knowledge_documents.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "delete_own_knowledge_documents" ON public.knowledge_documents
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_sources
    WHERE public.content_sources.id = public.knowledge_documents.content_source_id
    AND public.content_sources.user_id = (SELECT auth.uid())
  ));

-- Triggers for updated_at on subtype tables
CREATE TRIGGER journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes on subtype tables
CREATE INDEX journal_entries_entry_date_idx ON public.journal_entries (entry_date);
CREATE INDEX knowledge_documents_document_type_idx ON public.knowledge_documents (document_type);
CREATE INDEX knowledge_documents_status_idx ON public.knowledge_documents (status);
CREATE INDEX knowledge_documents_category_idx ON public.knowledge_documents (category);

-- Step 6: Drop old entry_type column (source_type replaces it)
ALTER TABLE public.content_sources DROP COLUMN entry_type;

-- Update the search_vector trigger function to reference content_sources
CREATE OR REPLACE FUNCTION public.update_content_sources_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.content_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.tags, ' '), '')), 'C');
  return new;
end;
$function$;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS entries_search_vector_trigger ON public.content_sources;
DROP TRIGGER IF EXISTS content_sources_search_vector_trigger ON public.content_sources;

CREATE TRIGGER content_sources_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content_text, tags ON public.content_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_content_sources_search_vector();
