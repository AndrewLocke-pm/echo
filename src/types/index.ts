export type SourceType = 'journal' | 'knowledge';
export type AiAccess = 'allowed' | 'blocked';
export type ProcessingStatus =
  | 'not_requested'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'blocked';
export type ThemePreference = 'dark' | 'light' | 'system';
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';
export type EntityType = 'person' | 'organisation' | 'project' | 'place' | 'topic' | 'system' | 'date';
export type MemoryType =
  | 'preference'
  | 'goal'
  | 'fact'
  | 'relationship'
  | 'lesson'
  | 'project_context'
  | 'timeline_event'
  | 'current_state'
  | 'habit';
export type MemoryStatus = 'suggested' | 'approved' | 'rejected' | 'archived' | 'superseded';
export type ItemType = 'decision' | 'commitment' | 'concern' | 'question' | 'task' | 'idea';
export type ItemStatus = 'open' | 'resolved' | 'completed' | 'dismissed' | 'archived';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type KnowledgeDocumentType = 'note' | 'reference' | 'guide' | 'spec' | 'research' | 'bookmark';
export type KnowledgeDocumentStatus = 'active' | 'archived' | 'draft';

export interface KnowledgeCollection {
  id: string;
  user_id: string;
  workspace_id: string;
  parent_collection_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  colour: string | null;
  position: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Tree node used in the Knowledge sidebar / collection tree */
export interface CollectionTreeNode extends KnowledgeCollection {
  children: CollectionTreeNode[];
  documents: KnowledgeDocWithSource[];
}

/** knowledge_documents row joined with its content_source */
export interface KnowledgeDocWithSource {
  content_source_id: string;
  collection_id: string | null;
  parent_document_id: string | null;
  position: number;
  document_type: KnowledgeDocumentType;
  category: string | null;
  status: KnowledgeDocumentStatus;
  allow_memory_extraction: boolean;
  last_reviewed_at: string | null;
  review_due_at: string | null;
  // joined from content_sources
  title: string;
  updated_at: string;
  ai_access: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_theme: ThemePreference;
  default_workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string;
  colour: string;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentSource {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string | null;
  source_type: SourceType;
  title: string;
  content_text: string;
  content_json: string | null;
  entry_date: string;
  tags: string[];
  ai_access: AiAccess;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ContentSourceInsert = Omit<
  ContentSource,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'processing_error'
> & {
  processing_error?: string | null;
};

export type ContentSourceUpdate = Partial<
  Pick<
    ContentSource,
    | 'title'
    | 'content_text'
    | 'content_json'
    | 'entry_date'
    | 'tags'
    | 'ai_access'
    | 'processing_status'
    | 'processing_error'
    | 'project_id'
    | 'workspace_id'
  >
>;

export interface JournalEntry {
  content_source_id: string;
  entry_date: string;
  mood: string | null;
  weather: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  content_source_id: string;
  document_type: KnowledgeDocumentType;
  category: string | null;
  status: KnowledgeDocumentStatus;
  last_reviewed_at: string | null;
  review_due_at: string | null;
  allow_memory_extraction: boolean;
  collection_id: string | null;
  parent_document_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInsert {
  name: string;
  description?: string;
  icon?: string;
  colour?: string;
  is_default?: boolean;
}

export interface WorkspaceUpdate {
  name?: string;
  description?: string;
  icon?: string;
  colour?: string;
  is_default?: boolean;
  is_archived?: boolean;
}

export interface Project {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ProjectInsert = Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'completed_at'> & {
  completed_at?: string | null;
  deleted_at?: string | null;
};

export type ProjectUpdate = Partial<Pick<Project, 'name' | 'description' | 'status' | 'start_date' | 'target_date' | 'completed_at' | 'deleted_at'>>;

export interface ProcessingJob {
  id: string;
  user_id: string;
  workspace_id: string;
  content_source_id: string;
  job_type: string;
  status: JobStatus;
  attempt_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryChunk {
  id: string;
  user_id: string;
  workspace_id: string;
  content_source_id: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface EntryAiSummary {
  id: string;
  user_id: string;
  workspace_id: string;
  content_source_id: string;
  summary_text: string;
  model_name: string;
  prompt_version: string;
  source_content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  user_id: string;
  workspace_id: string;
  entity_type: EntityType;
  canonical_name: string;
  normalised_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryEntity {
  id: string;
  user_id: string;
  workspace_id: string;
  content_source_id: string;
  entity_id: string;
  source_excerpt: string | null;
  confidence: number;
  created_at: string;
}

export interface Memory {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string | null;
  memory_type: MemoryType;
  memory_text: string;
  normalised_text: string;
  status: MemoryStatus;
  confidence: number;
  sensitivity: 'low' | 'medium' | 'high';
  ai_access: AiAccess;
  last_confirmed_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MemorySource {
  id: string;
  user_id: string;
  workspace_id: string;
  memory_id: string;
  content_source_id: string;
  source_excerpt: string | null;
  created_at: string;
}

export interface ExtractedItem {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string | null;
  content_source_id: string;
  item_type: ItemType;
  content: string;
  status: ItemStatus;
  due_date: string | null;
  assigned_entity_id: string | null;
  confidence: number;
  source_excerpt: string | null;
  is_user_edited: boolean;
  last_user_edit_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Message {
  id: string;
  user_id: string;
  workspace_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources_json: SourceReference[] | null;
  model_name: string | null;
  created_at: string;
}

export interface SourceReference {
  content_source_id: string;
  source_title: string;
  source_date: string;
  excerpt: string;
  source_type: 'content_source' | 'chunk' | 'memory' | 'extracted_item';
  similarity?: number;
}

export interface Attachment {
  id: string;
  user_id: string;
  workspace_id: string;
  content_source_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  storage_bucket: string;
  created_at: string;
  updated_at: string;
}

/** Attachment joined with its parent content_source for project file listings */
export interface ProjectFile extends Attachment {
  ai_access: AiAccess;
}
