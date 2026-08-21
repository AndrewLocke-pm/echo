-- ============================================================
-- Domain Separation Step 2: Rename entry_id → content_source_id in all child tables
-- ============================================================

-- ============================================================
-- processing_jobs
-- ============================================================
ALTER TABLE public.processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_entry_owner_fk;
DROP INDEX IF EXISTS processing_jobs_entry_id_idx;
DROP INDEX IF EXISTS processing_jobs_entry_ws_user_fk_idx;
DROP INDEX IF EXISTS processing_jobs_one_active_per_entry_idx;
DROP INDEX IF EXISTS processing_jobs_failed_idx;
DROP INDEX IF EXISTS processing_jobs_pending_idx;

ALTER TABLE public.processing_jobs RENAME COLUMN entry_id TO content_source_id;

ALTER TABLE public.processing_jobs ADD CONSTRAINT processing_jobs_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX processing_jobs_content_source_id_idx ON public.processing_jobs (content_source_id);
CREATE INDEX processing_jobs_source_ws_user_fk_idx ON public.processing_jobs (content_source_id, workspace_id, user_id);
CREATE UNIQUE INDEX processing_jobs_one_active_per_source_idx ON public.processing_jobs (content_source_id)
  WHERE (status IN ('pending', 'processing'));
CREATE INDEX processing_jobs_failed_idx ON public.processing_jobs (content_source_id) WHERE (status = 'failed');
CREATE INDEX processing_jobs_pending_idx ON public.processing_jobs (content_source_id) WHERE (status IN ('pending', 'processing'));

-- ============================================================
-- entry_chunks
-- ============================================================
ALTER TABLE public.entry_chunks DROP CONSTRAINT IF EXISTS entry_chunks_entry_owner_fk;
ALTER TABLE public.entry_chunks DROP CONSTRAINT IF EXISTS entry_chunks_entry_chunk_unique;
DROP INDEX IF EXISTS entry_chunks_entry_id_idx;
DROP INDEX IF EXISTS entry_chunks_entry_ws_user_fk_idx;

ALTER TABLE public.entry_chunks RENAME COLUMN entry_id TO content_source_id;

ALTER TABLE public.entry_chunks ADD CONSTRAINT entry_chunks_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX entry_chunks_content_source_id_idx ON public.entry_chunks (content_source_id);
CREATE INDEX entry_chunks_source_ws_user_fk_idx ON public.entry_chunks (content_source_id, workspace_id, user_id);
CREATE UNIQUE INDEX entry_chunks_source_chunk_unique ON public.entry_chunks (content_source_id, chunk_index);

-- ============================================================
-- entry_ai_summaries
-- ============================================================
ALTER TABLE public.entry_ai_summaries DROP CONSTRAINT IF EXISTS entry_ai_summaries_entry_owner_fk;
ALTER TABLE public.entry_ai_summaries DROP CONSTRAINT IF EXISTS entry_ai_summaries_entry_hash_unique;
DROP INDEX IF EXISTS entry_ai_summaries_entry_id_idx;
DROP INDEX IF EXISTS entry_ai_summaries_entry_ws_user_fk_idx;

ALTER TABLE public.entry_ai_summaries RENAME COLUMN entry_id TO content_source_id;

ALTER TABLE public.entry_ai_summaries ADD CONSTRAINT entry_ai_summaries_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX entry_ai_summaries_content_source_id_idx ON public.entry_ai_summaries (content_source_id);
CREATE INDEX entry_ai_summaries_source_ws_user_fk_idx ON public.entry_ai_summaries (content_source_id, workspace_id, user_id);
CREATE UNIQUE INDEX entry_ai_summaries_source_hash_unique ON public.entry_ai_summaries (content_source_id, source_content_hash);

-- ============================================================
-- entry_entities
-- ============================================================
ALTER TABLE public.entry_entities DROP CONSTRAINT IF EXISTS entry_entities_entry_owner_fk;
ALTER TABLE public.entry_entities DROP CONSTRAINT IF EXISTS entry_entities_entry_entity_unique;
DROP INDEX IF EXISTS entry_entities_entry_id_idx;
DROP INDEX IF EXISTS entry_entities_entry_ws_user_fk_idx;

ALTER TABLE public.entry_entities RENAME COLUMN entry_id TO content_source_id;

ALTER TABLE public.entry_entities ADD CONSTRAINT entry_entities_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX entry_entities_content_source_id_idx ON public.entry_entities (content_source_id);
CREATE INDEX entry_entities_source_ws_user_fk_idx ON public.entry_entities (content_source_id, workspace_id, user_id);
CREATE UNIQUE INDEX entry_entities_source_entity_unique ON public.entry_entities (content_source_id, entity_id);

-- ============================================================
-- extracted_items
-- ============================================================
ALTER TABLE public.extracted_items DROP CONSTRAINT IF EXISTS extracted_items_entry_owner_fk;
DROP INDEX IF EXISTS extracted_items_entry_id_idx;
DROP INDEX IF EXISTS extracted_items_entry_ws_user_fk_idx;

ALTER TABLE public.extracted_items RENAME COLUMN entry_id TO content_source_id;

ALTER TABLE public.extracted_items ADD CONSTRAINT extracted_items_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX extracted_items_content_source_id_idx ON public.extracted_items (content_source_id);
CREATE INDEX extracted_items_source_ws_user_fk_idx ON public.extracted_items (content_source_id, workspace_id, user_id);

-- ============================================================
-- memory_sources
-- ============================================================
ALTER TABLE public.memory_sources DROP CONSTRAINT IF EXISTS memory_sources_entry_owner_fk;
ALTER TABLE public.memory_sources DROP CONSTRAINT IF EXISTS memory_sources_memory_entry_unique;
DROP INDEX IF EXISTS memory_sources_entry_id_idx;
DROP INDEX IF EXISTS memory_sources_entry_ws_user_fk_idx;

ALTER TABLE public.memory_sources RENAME COLUMN entry_id TO content_source_id;

ALTER TABLE public.memory_sources ADD CONSTRAINT memory_sources_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

CREATE INDEX memory_sources_content_source_id_idx ON public.memory_sources (content_source_id);
CREATE INDEX memory_sources_source_ws_user_fk_idx ON public.memory_sources (content_source_id, workspace_id, user_id);
CREATE UNIQUE INDEX memory_sources_memory_source_unique ON public.memory_sources (memory_id, content_source_id);
