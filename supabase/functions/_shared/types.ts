// Extraction types shared between provider and function

export interface ExtractEntryInput {
  entryId: string;
  title: string;
  content: string;
  projectName?: string;
  projectDescription?: string;
}

export interface ExtractedEntity {
  name: string;
  type: string;
  context: string;
  source_excerpt: string;
  confidence: number;
}

export interface ExtractedMemory {
  memory_text: string;
  memory_type: string;
  reason_durable: string;
  source_excerpt: string;
  confidence: number;
}

export interface ExtractedItem {
  item_type: string;
  content: string;
  source_excerpt: string;
  due_date: string | null;
  confidence: number;
}

export interface EntryExtraction {
  summary: string;
  entities: ExtractedEntity[];
  memories: ExtractedMemory[];
  items: ExtractedItem[];
}
