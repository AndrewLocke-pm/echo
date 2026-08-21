import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderPlus,
  FilePlus,
  Lightbulb,
  FolderOpen,
  ArrowUpDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useKnowledgeTree, getCollectionPath } from '@/hooks/use-knowledge-tree';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CollectionBreadcrumbs } from '@/components/collection-breadcrumbs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatRelative } from '@/lib/format';
import type { KnowledgeCollection } from '@/types';

type SortMode = 'manual' | 'title' | 'updated' | 'reviewed' | 'type' | 'status';

export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const [sort, setSort] = useState<SortMode>('manual');

  const { data: treeData, isLoading } = useKnowledgeTree(wsId);

  const { data: collection } = useQuery({
    queryKey: ['collection', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_collections')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as KnowledgeCollection | null;
    },
    enabled: !!id,
  });

  if (isLoading || !treeData) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!collection) {
    return <div className="text-muted-foreground">Collection not found</div>;
  }

  const breadcrumbPath = getCollectionPath(treeData.collections, collection.id);

  // Find this collection's children and documents from the tree
  const findNode = (nodes: typeof treeData.tree, targetId: string): typeof treeData.tree[number] | null => {
    for (const n of nodes) {
      if (n.id === targetId) return n;
      const child = findNode(n.children, targetId);
      if (child) return child;
    }
    return null;
  };

  const node = findNode(treeData.tree, collection.id);
  const childCollections = node?.children ?? [];
  let documents = node?.documents ?? [];

  // Sort documents
  documents = [...documents].sort((a, b) => {
    switch (sort) {
      case 'title': return a.title.localeCompare(b.title);
      case 'updated': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      case 'reviewed': return (b.last_reviewed_at ?? '').localeCompare(a.last_reviewed_at ?? '');
      case 'type': return a.document_type.localeCompare(b.document_type);
      case 'status': return a.status.localeCompare(b.status);
      default: return a.position - b.position;
    }
  });

  return (
    <div className="space-y-6">
      <CollectionBreadcrumbs path={breadcrumbPath} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {collection.icon ? (
            <span className="text-3xl">{collection.icon}</span>
          ) : (
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          )}
          <div>
            <h1 className="text-2xl font-bold">{collection.name}</h1>
            {collection.description && (
              <p className="text-sm text-muted-foreground">{collection.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/knowledge/new?collection=${collection.id}`)}>
            <FilePlus className="mr-1.5 h-4 w-4" /> New document
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/knowledge/collections/new?parent=${collection.id}`)}>
            <FolderPlus className="mr-1.5 h-4 w-4" /> New collection
          </Button>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual order</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="updated">Last updated</SelectItem>
            <SelectItem value="reviewed">Last reviewed</SelectItem>
            <SelectItem value="type">Document type</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Child collections */}
      {childCollections.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Collections</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {childCollections.map((child) => (
              <Link key={child.id} to={`/knowledge/collections/${child.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    {child.icon ? (
                      <span className="text-xl">{child.icon}</span>
                    ) : (
                      <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{child.name}</p>
                      {child.description && (
                        <p className="truncate text-xs text-muted-foreground">{child.description}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Documents</h2>
        {documents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 p-8">
              <Lightbulb className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No documents in this collection yet</p>
              <Button size="sm" onClick={() => navigate(`/knowledge/new?collection=${collection.id}`)}>
                <FilePlus className="mr-1.5 h-4 w-4" /> Create document
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <Link key={doc.content_source_id} to={`/entries/${doc.content_source_id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Lightbulb className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Updated {formatRelative(doc.updated_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-xs">{doc.document_type}</Badge>
                      <Badge variant="secondary" className="text-xs">{doc.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
