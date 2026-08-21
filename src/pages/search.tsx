import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search as SearchIcon,
  BookOpen,
  Lightbulb,
  Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useKnowledgeTree, getCollectionPath } from '@/hooks/use-knowledge-tree';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate, truncate } from '@/lib/format';

type SearchResultType = 'entry' | 'workspace' | 'memory';

interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  excerpt: string;
  workspace_name?: string;
  workspace_icon?: string;
  date: string;
  source_type?: string;
  collection_path?: string;
  link: string;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('current');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const { currentWorkspace, allWorkspaces, workspaces } = useWorkspace();
  const wsId = workspaceFilter === 'current' && !allWorkspaces && currentWorkspace
    ? currentWorkspace.id
    : null;
  const { data: treeData } = useKnowledgeTree(wsId);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams]);

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query, typeFilter, wsId, collectionFilter],
    queryFn: async () => {
      if (!query.trim()) return [];

      let entryQuery = supabase
        .from('content_sources')
        .select('id, title, content_text, source_type, entry_date, workspaces(name, icon), knowledge_documents(collection_id)')
        .is('deleted_at', null)
        .textSearch('search_vector', query.trim())
        .limit(20);

      if (wsId) {
        entryQuery = entryQuery.eq('workspace_id', wsId);
      }
      if (typeFilter !== 'all' && typeFilter !== 'workspace') {
        entryQuery = entryQuery.eq('source_type', typeFilter);
      }

      // Exclude documents in archived collections unless explicitly included
      if (treeData && treeData.collections.some((c) => c.is_archived)) {
        const archivedCollectionIds = treeData.collections
          .filter((c) => c.is_archived)
          .map((c) => c.id);
        entryQuery = entryQuery.not('knowledge_documents.collection_id', 'in', `(${archivedCollectionIds.map((id) => `'${id}'`).join(',')})`);
      }

      // Filter by specific collection
      if (collectionFilter !== 'all') {
        if (collectionFilter === 'root') {
          entryQuery = entryQuery.is('knowledge_documents.collection_id', null);
        } else {
          entryQuery = entryQuery.eq('knowledge_documents.collection_id', collectionFilter);
        }
      }

      const { data: entries, error } = await entryQuery;
      if (error) throw error;

      return (entries || []).map((e) => {
        const kd = Array.isArray(e.knowledge_documents) ? e.knowledge_documents[0] : e.knowledge_documents;
        const collectionPath = kd?.collection_id && treeData
          ? getCollectionPath(treeData.collections, kd.collection_id)
          : [];
        const pathStr = collectionPath.length > 0
          ? collectionPath.map((c) => c.name).join(' / ')
          : '';
        return {
          id: e.id,
          type: 'entry' as SearchResultType,
          title: e.title || 'Untitled',
          excerpt: truncate(e.content_text, 150),
          workspace_name: e.workspaces?.[0]?.name,
          workspace_icon: e.workspaces?.[0]?.icon,
          date: e.entry_date,
          source_type: e.source_type,
          collection_path: pathStr,
          link: `/entries/${e.id}`,
        } as SearchResult;
      });
    },
    enabled: query.trim().length > 0,
  });

  function handleSearch(value: string) {
    setQuery(value);
    if (value.trim()) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Search across your journal entries and knowledge notes
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search your entries..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="journal">Journal</SelectItem>
            <SelectItem value="knowledge">Knowledge notes</SelectItem>
          </SelectContent>
        </Select>
        {!allWorkspaces && workspaces.length > 1 && (
          <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current workspace</SelectItem>
              <SelectItem value="all">All workspaces</SelectItem>
            </SelectContent>
          </Select>
        )}
        {treeData && treeData.collections.length > 0 && (
          <Select value={collectionFilter} onValueChange={setCollectionFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              <SelectItem value="root">Root (no collection)</SelectItem>
              {treeData.collections.filter((c) => !c.is_archived).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !query.trim() ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <SearchIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">Start searching</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Search across your journal entries and knowledge notes using full-text search
          </p>
        </div>
      ) : results && results.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          {results.map((result) => (
            <Link key={`${result.type}-${result.id}`} to={result.link}>
              <Card className="transition-colors hover:border-teal/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      {result.source_type === 'journal' ? (
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Lightbulb className="h-4 w-4 text-amber" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium hover:text-teal">
                        {result.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {result.excerpt}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {result.workspace_name && (
                          <span className="flex items-center gap-1">
                            {result.workspace_icon} {result.workspace_name}
                          </span>
                        )}
                        <span>·</span>
                        <span>{formatDate(result.date)}</span>
                        <Badge variant="outline" className="text-xs">
                          {result.source_type === 'journal' ? 'Journal' : 'Note'}
                        </Badge>
                        {result.collection_path && (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.collection_path}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <SearchIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No results found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try different keywords or check your filters
          </p>
        </div>
      )}
    </div>
  );
}
