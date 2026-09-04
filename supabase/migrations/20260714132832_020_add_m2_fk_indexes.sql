
/*
# Add indexes for all unindexed foreign keys (Milestone 2)
*/

-- Composite (workspace_id, user_id) indexes for FKs to workspaces
CREATE INDEX IF NOT EXISTS entities_workspace_user_fk_idx ON public.entities (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS entry_ai_summaries_workspace_user_fk_idx ON public.entry_ai_summaries (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS entry_chunks_workspace_user_fk_idx ON public.entry_chunks (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS entry_entities_workspace_user_fk_idx ON public.entry_entities (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS extracted_items_workspace_user_fk_idx ON public.extracted_items (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS memories_workspace_user_fk_idx ON public.memories (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS memory_sources_workspace_user_fk_idx ON public.memory_sources (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS processing_jobs_workspace_user_fk_idx ON public.processing_jobs (workspace_id, user_id);

-- Composite (entry_id, workspace_id, user_id) indexes for FKs to entries
CREATE INDEX IF NOT EXISTS entry_ai_summaries_entry_ws_user_fk_idx ON public.entry_ai_summaries (entry_id, workspace_id, user_id);
CREATE INDEX IF NOT EXISTS entry_chunks_entry_ws_user_fk_idx ON public.entry_chunks (entry_id, workspace_id, user_id);
CREATE INDEX IF NOT EXISTS entry_entities_entry_ws_user_fk_idx ON public.entry_entities (entry_id, workspace_id, user_id);
CREATE INDEX IF NOT EXISTS extracted_items_entry_ws_user_fk_idx ON public.extracted_items (entry_id, workspace_id, user_id);
CREATE INDEX IF NOT EXISTS memory_sources_entry_ws_user_fk_idx ON public.memory_sources (entry_id, workspace_id, user_id);
CREATE INDEX IF NOT EXISTS processing_jobs_entry_ws_user_fk_idx ON public.processing_jobs (entry_id, workspace_id, user_id);

-- Composite (project_id, workspace_id, user_id) index for FK from entries to projects
CREATE INDEX IF NOT EXISTS entries_project_ws_user_fk_idx ON public.entries (project_id, workspace_id, user_id)
  WHERE project_id IS NOT NULL;

-- Composite (entity_id, workspace_id, user_id) index for FK from entry_entities to entities
CREATE INDEX IF NOT EXISTS entry_entities_entity_ws_user_fk_idx ON public.entry_entities (entity_id, workspace_id, user_id);

-- Composite (memory_id, workspace_id, user_id) index for FK from memory_sources to memories
CREATE INDEX IF NOT EXISTS memory_sources_memory_ws_user_fk_idx ON public.memory_sources (memory_id, workspace_id, user_id);

-- Single-column indexes for nullable FKs
CREATE INDEX IF NOT EXISTS memories_superseded_by_idx ON public.memories (superseded_by)
  WHERE superseded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS extracted_items_assigned_entity_idx ON public.extracted_items (assigned_entity_id)
  WHERE assigned_entity_id IS NOT NULL;
