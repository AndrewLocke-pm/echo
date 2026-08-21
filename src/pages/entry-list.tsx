import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  RotateCcw,
  Calendar,
  Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatRelative, truncate } from '@/lib/format';
import type { ContentSource, SourceType } from '@/types';

interface EntryListProps {
  sourceType: SourceType;
}

export function EntryListPage({ sourceType }: EntryListProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWorkspace, allWorkspaces, workspaces } = useWorkspace();
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('current');

  const wsId = workspaceFilter === 'current' && !allWorkspaces && currentWorkspace
    ? currentWorkspace.id
    : null;

  const { data: entries, isLoading } = useQuery({
    queryKey: ['entries', sourceType, wsId, showTrash, search],
    queryFn: async () => {
      let query = supabase
        .from('content_sources')
        .select('*, workspaces(name, icon, colour)')
        .eq('source_type', sourceType)
        .order('entry_date', { ascending: false })
        .limit(50);

      if (showTrash) {
        query = query.not('deleted_at', 'is', null);
      } else {
        query = query.is('deleted_at', null);
      }

      if (wsId) {
        query = query.eq('workspace_id', wsId);
      }

      if (search.trim()) {
        query = query.textSearch('search_vector', search.trim());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (ContentSource & { workspaces: { name: string; icon: string; colour: string } | null })[];
    },
  });

  async function handleRestore(id: string) {
    const { error } = await supabase
      .from('content_sources')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to restore', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    toast({ title: 'Entry restored' });
  }

  async function handlePermanentDelete(id: string) {
    const { error } = await supabase.from('content_sources').delete().eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    toast({ title: 'Entry permanently deleted' });
  }

  const title = sourceType === 'journal' ? 'Journal' : 'Knowledge Base';
  const newRoute = sourceType === 'journal' ? '/journal/new' : '/knowledge/new';

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {sourceType === 'journal'
              ? 'Your personal journal entries'
              : 'Your knowledge notes and references'}
          </p>
        </div>
        <Button onClick={() => navigate(newRoute)}>
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {!allWorkspaces && workspaces.length > 1 && (
          <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current workspace</SelectItem>
              <SelectItem value="all">All workspaces</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          variant={showTrash ? 'secondary' : 'outline'}
          onClick={() => setShowTrash(!showTrash)}
          className="shrink-0"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {showTrash ? 'Trash' : 'Trash'}
        </Button>
      </div>

      {/* Entries list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id} className="transition-colors hover:border-teal/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {showTrash ? (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {entry.title || 'Untitled'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {truncate(entry.content_text, 100)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Deleted {formatRelative(entry.deleted_at!)}
                      </p>
                    </div>
                  ) : (
                    <Link
                      to={`/entries/${entry.id}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.entry_date)}
                        </span>
                        {entry.workspaces && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            · {entry.workspaces.icon} {entry.workspaces.name}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 truncate text-sm font-medium hover:text-teal">
                        {entry.title || 'Untitled'}
                      </h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {truncate(entry.content_text, 120)}
                      </p>
                      {entry.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Link>
                  )}
                  {showTrash ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRestore(entry.id)}
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive" title="Delete permanently">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. The entry will be permanently removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handlePermanentDelete(entry.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : (
                    <ProcessingBadge status={entry.processing_status} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            {sourceType === 'journal' ? (
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            ) : (
              <Search className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <h3 className="text-lg font-medium">
            {showTrash ? 'Trash is empty' : search ? 'No results found' : `No ${sourceType === 'journal' ? 'entries' : 'notes'} yet`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {showTrash
              ? 'Deleted entries will appear here'
              : search
              ? 'Try a different search term'
              : 'Create your first entry to get started'}
          </p>
          {!showTrash && !search && (
            <Button className="mt-4" onClick={() => navigate(newRoute)}>
              <Plus className="mr-2 h-4 w-4" />
              Create {sourceType === 'journal' ? 'entry' : 'note'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ProcessingBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    not_requested: { label: 'Not processed', variant: 'secondary' },
    pending: { label: 'Pending', variant: 'outline' },
    processing: { label: 'Processing', variant: 'outline' },
    completed: { label: 'Processed', variant: 'default' },
    failed: { label: 'Failed', variant: 'destructive' },
    blocked: { label: 'Blocked', variant: 'secondary' },
  };
  const c = config[status] || config.not_requested;
  return <Badge variant={c.variant} className="shrink-0 text-xs">{c.label}</Badge>;
}
