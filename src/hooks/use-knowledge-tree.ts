import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type {
  KnowledgeCollection,
  CollectionTreeNode,
  KnowledgeDocWithSource,
} from '@/types';

export function buildCollectionTree(
  collections: KnowledgeCollection[],
  docs: KnowledgeDocWithSource[],
  parentId: string | null = null,
): CollectionTreeNode[] {
  return collections
    .filter((c) => c.parent_collection_id === parentId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((c) => ({
      ...c,
      children: buildCollectionTree(collections, docs, c.id),
      documents: docs
        .filter((d) => d.collection_id === c.id && d.parent_document_id === null)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    }));
}

export function getCollectionPath(
  collections: KnowledgeCollection[],
  collectionId: string | null,
): KnowledgeCollection[] {
  if (!collectionId) return [];
  const path: KnowledgeCollection[] = [];
  let current = collections.find((c) => c.id === collectionId) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parent_collection_id
      ? (collections.find((c) => c.id === current!.parent_collection_id) ?? null)
      : null;
  }
  return path;
}

export function useKnowledgeTree(workspaceId: string | null) {
  return useQuery({
    queryKey: ['knowledge-tree', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { collections: [], docs: [], tree: [], rootDocs: [] };

      const [collectionsRes, docsRes] = await Promise.all([
        supabase
          .from('knowledge_collections')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('position', { ascending: true }),
        supabase
          .from('knowledge_documents')
          .select(`
            content_source_id,
            collection_id,
            parent_document_id,
            position,
            document_type,
            category,
            status,
            allow_memory_extraction,
            last_reviewed_at,
            review_due_at,
            content_sources!inner(id, title, updated_at, ai_access, deleted_at)
          `)
          .is('content_sources.deleted_at', null)
          .order('position', { ascending: true }),
      ]);

      if (collectionsRes.error) throw collectionsRes.error;
      if (docsRes.error) throw docsRes.error;

      const collections = (collectionsRes.data ?? []) as KnowledgeCollection[];

      const docs: KnowledgeDocWithSource[] = (docsRes.data ?? []).map((d) => {
        const cs = Array.isArray(d.content_sources) ? d.content_sources[0] : d.content_sources;
        return {
          content_source_id: d.content_source_id,
          collection_id: d.collection_id,
          parent_document_id: d.parent_document_id,
          position: d.position,
          document_type: d.document_type,
          category: d.category,
          status: d.status,
          allow_memory_extraction: d.allow_memory_extraction,
          last_reviewed_at: d.last_reviewed_at,
          review_due_at: d.review_due_at,
          title: cs?.title ?? 'Untitled',
          updated_at: cs?.updated_at ?? '',
          ai_access: cs?.ai_access ?? 'allowed',
        };
      });

      const tree = buildCollectionTree(collections, docs, null);
      const rootDocs = docs
        .filter((d) => d.collection_id === null && d.parent_document_id === null)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

      return { collections, docs, tree, rootDocs };
    },
    enabled: !!workspaceId,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      workspace_id: string;
      name: string;
      description?: string;
      icon?: string;
      colour?: string;
      parent_collection_id?: string | null;
      position?: number;
    }) => {
      const { data, error } = await supabase
        .from('knowledge_collections')
        .insert(values)
        .select('*')
        .single();
      if (error) throw error;
      return data as KnowledgeCollection;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['knowledge-tree', data.workspace_id] }),
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workspaceId,
      ...values
    }: Partial<KnowledgeCollection> & { id: string; workspaceId: string }) => {
      const { error } = await supabase
        .from('knowledge_collections')
        .update(values)
        .eq('id', id);
      if (error) throw error;
      return { id, workspaceId };
    },
    onSuccess: ({ workspaceId }) =>
      qc.invalidateQueries({ queryKey: ['knowledge-tree', workspaceId] }),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workspaceId,
    }: {
      id: string;
      workspaceId: string;
    }) => {
      // Block deletion if non-empty (checked client-side via tree; DB will RESTRICT via FK anyway)
      const { error } = await supabase
        .from('knowledge_collections')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { workspaceId };
    },
    onSuccess: ({ workspaceId }) =>
      qc.invalidateQueries({ queryKey: ['knowledge-tree', workspaceId] }),
  });
}

export function useMoveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contentSourceId,
      collectionId,
      parentDocumentId,
      position,
      workspaceId,
    }: {
      contentSourceId: string;
      collectionId: string | null;
      parentDocumentId: string | null;
      position: number;
      workspaceId: string;
    }) => {
      const { error } = await supabase
        .from('knowledge_documents')
        .update({ collection_id: collectionId, parent_document_id: parentDocumentId, position })
        .eq('content_source_id', contentSourceId);
      if (error) throw error;
      return { workspaceId };
    },
    onSuccess: ({ workspaceId }) =>
      qc.invalidateQueries({ queryKey: ['knowledge-tree', workspaceId] }),
  });
}
