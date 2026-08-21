import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Edit,
  Trash2,
  Loader2,
  Sparkles,
  Tag,
  Shield,
  ShieldOff,
  RotateCw,
  FileText,
  CheckCircle2,
  XCircle,
  Gavel,
  Handshake,
  AlertCircle,
  HelpCircle,
  ListTodo,
  Lightbulb,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RichEditor } from '@/components/rich-editor';
import { DocBreadcrumbs } from '@/components/collection-breadcrumbs';
import { useKnowledgeTree, getCollectionPath } from '@/hooks/use-knowledge-tree';
import { useWorkspace } from '@/hooks/use-workspace';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatRelative, formatDateTime, truncate } from '@/lib/format';
import type { ContentSource, EntryAiSummary, Entity, ExtractedItem, Memory, ItemType, ItemStatus } from '@/types';

const ITEM_ICONS: Record<ItemType, typeof Gavel> = {
  decision: Gavel,
  commitment: Handshake,
  concern: AlertCircle,
  question: HelpCircle,
  task: ListTodo,
  idea: Lightbulb,
};

const ITEM_LABELS: Record<ItemType, string> = {
  decision: 'Decisions',
  commitment: 'Commitments',
  concern: 'Concerns',
  question: 'Questions',
  task: 'Tasks',
  idea: 'Ideas',
};

const STATUS_OPTIONS: ItemStatus[] = ['open', 'resolved', 'completed', 'dismissed', 'archived'];

export function EntryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entry, isLoading } = useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_sources')
        .select('*, workspaces(name, icon, colour)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as (ContentSource & { workspaces: { name: string; icon: string; colour: string } | null }) | null;
    },
    enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ['entry-summary', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entry_ai_summaries')
        .select('*')
        .eq('content_source_id', id!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as EntryAiSummary | null;
    },
    enabled: !!id && entry?.processing_status === 'completed',
  });

  const { data: entities } = useQuery({
    queryKey: ['entry-entities', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entry_entities')
        .select('id, source_excerpt, confidence, entities:entities(id, canonical_name, entity_type)')
        .eq('content_source_id', id!);
      if (error) throw error;
      return data as unknown as Array<{ id: string; source_excerpt: string | null; confidence: number; entities: Entity | null }>;
    },
    enabled: !!id && entry?.processing_status === 'completed',
  });

  const { data: items } = useQuery({
    queryKey: ['entry-items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extracted_items')
        .select('*')
        .eq('content_source_id', id!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ExtractedItem[];
    },
    enabled: !!id && entry?.processing_status === 'completed',
  });

  const { data: memories } = useQuery({
    queryKey: ['entry-memories', id],
    queryFn: async () => {
      const { data: sources } = await supabase
        .from('memory_sources')
        .select('memory_id, source_excerpt, memories!inner(id, memory_text, memory_type, status, confidence, sensitivity)')
        .eq('content_source_id', id!);
      if (sources) {
        return sources.map((s: Record<string, unknown>) => ({
          id: (s.memories as Memory).id,
          memory_text: (s.memories as Memory).memory_text,
          memory_type: (s.memories as Memory).memory_type,
          status: (s.memories as Memory).status,
          confidence: (s.memories as Memory).confidence,
          sensitivity: (s.memories as Memory).sensitivity,
          source_excerpt: s.source_excerpt as string | null,
        })) as Array<Memory & { source_excerpt: string | null }>;
      }
      return [];
    },
    enabled: !!id && entry?.processing_status === 'completed',
  });

  async function handleDelete() {
    if (!id) return;
    const { error } = await supabase
      .from('content_sources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    queryClient.invalidateQueries({ queryKey: ['recent-entries'] });
    toast({ title: 'Entry moved to trash' });
    navigate('/journal');
  }

  async function toggleAiAccess() {
    if (!entry || !id) return;
    const newAccess = entry.ai_access === 'allowed' ? 'blocked' : 'allowed';
    const newStatus = newAccess === 'blocked' ? 'blocked' : 'not_requested';
    const { error } = await supabase
      .from('content_sources')
      .update({ ai_access: newAccess, processing_status: newStatus })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entry', id] });
    toast({ title: `AI access ${newAccess === 'allowed' ? 'enabled' : 'blocked'}` });
  }

  async function retryProcessing() {
    if (!id) return;
    const { error } = await supabase
      .from('content_sources')
      .update({ processing_status: 'pending', processing_error: null })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to retry', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entry', id] });

    // Trigger the edge function
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.access_token) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-entry`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.session.access_token}`,
            },
            body: JSON.stringify({ content_source_id: id }),
          }
        );
      }
    } catch {
      // Non-blocking
    }

    queryClient.invalidateQueries({ queryKey: ['entry', id] });
    toast({ title: 'Processing queued for retry' });
  }

  async function updateItemStatus(itemId: string, status: ItemStatus) {
    const { error } = await supabase
      .from('extracted_items')
      .update({ status, is_user_edited: true, last_user_edit_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entry-items', id] });
    toast({ title: 'Item updated' });
  }

  async function approveMemory(memoryId: string) {
    const { error } = await supabase
      .from('memories')
      .update({ status: 'approved', last_confirmed_at: new Date().toISOString() })
      .eq('id', memoryId);
    if (error) {
      toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entry-memories', id] });
    toast({ title: 'Memory approved' });
  }

  async function rejectMemory(memoryId: string) {
    const { error } = await supabase
      .from('memories')
      .update({ status: 'rejected' })
      .eq('id', memoryId);
    if (error) {
      toast({ title: 'Failed to reject', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entry-memories', id] });
    toast({ title: 'Memory rejected' });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-medium">Entry not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This entry may have been deleted or you don't have access.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/journal')}>
          Back to journal
        </Button>
      </div>
    );
  }

  const isJournal = entry.source_type === 'journal';
  const editRoute = isJournal ? `/journal/${entry.id}/edit` : `/knowledge/${entry.id}/edit`;
  const isCompleted = entry.processing_status === 'completed';

  // Group items by type
  const itemsByType = (items || []).reduce<Record<string, ExtractedItem[]>>((acc, item) => {
    if (!acc[item.item_type]) acc[item.item_type] = [];
    acc[item.item_type].push(item);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(editRoute)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAiAccess}
            title={entry.ai_access === 'allowed' ? 'Block AI access' : 'Allow AI access'}
          >
            {entry.ai_access === 'allowed' ? (
              <Shield className="h-4 w-4 text-teal" />
            ) : (
              <ShieldOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move the entry to trash. You can restore it later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Main content */}
        <div className="md:col-span-2 space-y-4">
          {!isJournal && <CollectionBreadcrumbsForDoc entry={entry} />}
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(entry.entry_date, 'EEEE, MMM d, yyyy')}
              {entry.workspaces && (
                <span className="flex items-center gap-1">
                  · {entry.workspaces.icon} {entry.workspaces.name}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold">{entry.title || 'Untitled'}</h1>
          </div>

          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entry.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  <Tag className="h-3 w-3" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-4">
              {entry.content_json ? (
                <RichEditor
                  value={entry.content_json}
                  onChange={() => {}}
                  editable={false}
                  variant={entry.source_type}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {entry.content_text || 'No content'}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground">
            Created {formatRelative(entry.created_at)} · Updated {formatRelative(entry.updated_at)}
          </div>
        </div>

        {/* AI Insights panel */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-teal" />
                AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
                  <TabsTrigger value="entities" className="text-xs">Entities</TabsTrigger>
                  <TabsTrigger value="items" className="text-xs">Items</TabsTrigger>
                  <TabsTrigger value="memories" className="text-xs">Memories</TabsTrigger>
                </TabsList>

                {/* Summary tab */}
                <TabsContent value="summary" className="mt-3">
                  {isCompleted && summary ? (
                    <div className="space-y-2">
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="mr-1 h-3 w-3" />
                        AI-generated
                      </Badge>
                      <p className="text-xs leading-relaxed">{summary.summary_text}</p>
                      <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        <p>Model: {summary.model_name}</p>
                        <p>Processed: {formatDateTime(summary.created_at)}</p>
                      </div>
                    </div>
                  ) : (
                    <ProcessingStatusContent
                      status={entry.processing_status}
                      error={entry.processing_error}
                      onRetry={retryProcessing}
                      feature="summary"
                    />
                  )}
                </TabsContent>

                {/* Entities tab */}
                <TabsContent value="entities" className="mt-3">
                  {isCompleted && entities && entities.length > 0 ? (
                    <div className="space-y-2">
                      {entities.map((ee) => (
                        <div key={ee.id} className="rounded-md border border-border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{ee.entities?.canonical_name}</span>
                            <Badge variant="secondary" className="text-xs">{ee.entities?.entity_type}</Badge>
                          </div>
                          {ee.source_excerpt && (
                            <p className="mt-1 text-xs italic text-muted-foreground">
                              "{truncate(ee.source_excerpt, 120)}"
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Confidence: {Math.round(ee.confidence * 100)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : isCompleted ? (
                    <p className="text-xs text-muted-foreground">No entities extracted from this entry.</p>
                  ) : (
                    <ProcessingStatusContent
                      status={entry.processing_status}
                      error={entry.processing_error}
                      onRetry={retryProcessing}
                      feature="entities"
                    />
                  )}
                </TabsContent>

                {/* Items tab */}
                <TabsContent value="items" className="mt-3">
                  {isCompleted && items && items.length > 0 ? (
                    <div className="space-y-3">
                      {(['decision', 'commitment', 'concern', 'question', 'task', 'idea'] as ItemType[]).map((type) => {
                        const typeItems = itemsByType[type] || [];
                        if (typeItems.length === 0) return null;
                        const Icon = ITEM_ICONS[type];
                        return (
                          <div key={type}>
                            <p className="mb-1 flex items-center gap-1 text-xs font-medium">
                              <Icon className="h-3 w-3 text-teal" />
                              {ITEM_LABELS[type]}
                            </p>
                            {typeItems.map((item) => (
                              <div key={item.id} className="mb-1 rounded-md border border-border p-2">
                                <p className="text-xs">{item.content}</p>
                                {item.source_excerpt && (
                                  <p className="mt-1 text-xs italic text-muted-foreground">
                                    "{truncate(item.source_excerpt, 100)}"
                                  </p>
                                )}
                                <div className="mt-1 flex items-center gap-2">
                                  <Select
                                    value={item.status}
                                    onValueChange={(v) => updateItemStatus(item.id, v as ItemStatus)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_OPTIONS.map((s) => (
                                        <SelectItem key={s} value={s} className="text-xs">
                                          {s}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {item.due_date && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {formatDate(item.due_date)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ) : isCompleted ? (
                    <p className="text-xs text-muted-foreground">No items extracted from this entry.</p>
                  ) : (
                    <ProcessingStatusContent
                      status={entry.processing_status}
                      error={entry.processing_error}
                      onRetry={retryProcessing}
                      feature="items"
                    />
                  )}
                </TabsContent>

                {/* Memories tab */}
                <TabsContent value="memories" className="mt-3">
                  {isCompleted && memories && memories.length > 0 ? (
                    <div className="space-y-2">
                      {memories.map((mem) => (
                        <div key={mem.id} className="rounded-md border border-border p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs">{mem.memory_text}</p>
                            <Badge variant="outline" className="text-xs shrink-0">{mem.memory_type}</Badge>
                          </div>
                          {mem.source_excerpt && (
                            <p className="mt-1 text-xs italic text-muted-foreground">
                              "{truncate(mem.source_excerpt, 100)}"
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Confidence: {Math.round(mem.confidence * 100)}%
                          </p>
                          {mem.status === 'suggested' && (
                            <div className="mt-2 flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => approveMemory(mem.id)}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive"
                                onClick={() => rejectMemory(mem.id)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Reject
                              </Button>
                            </div>
                          )}
                          {mem.status === 'approved' && (
                            <Badge variant="default" className="mt-1 text-xs">Approved</Badge>
                          )}
                          {mem.status === 'rejected' && (
                            <Badge variant="secondary" className="mt-1 text-xs">Rejected</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : isCompleted ? (
                    <p className="text-xs text-muted-foreground">No memory suggestions from this entry.</p>
                  ) : (
                    <ProcessingStatusContent
                      status={entry.processing_status}
                      error={entry.processing_error}
                      onRetry={retryProcessing}
                      feature="memories"
                    />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Processing status */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Processing status</span>
                  <ProcessingBadge status={entry.processing_status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">AI access</span>
                  <Badge variant={entry.ai_access === 'allowed' ? 'default' : 'secondary'} className="text-xs">
                    {entry.ai_access === 'allowed' ? 'Allowed' : 'Blocked'}
                  </Badge>
                </div>
                {entry.processing_error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                    {entry.processing_error}
                  </div>
                )}
                {entry.processing_status === 'failed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={retryProcessing}
                  >
                    <RotateCw className="mr-2 h-3 w-3" />
                    Retry processing
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProcessingStatusContent({
  status,
  error,
  onRetry,
  feature,
}: {
  status: string;
  error: string | null;
  onRetry: () => void;
  feature: string;
}) {
  if (status === 'processing' || status === 'pending') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing...
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">
          {error ? `Processing failed: ${error.slice(0, 100)}` : 'Processing failed'}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry} className="w-full">
          <RotateCw className="mr-2 h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldOff className="h-3 w-3" />
        AI access is blocked for this entry
      </div>
    );
  }

  if (status === 'not_requested') {
    return (
      <p className="text-xs text-muted-foreground">
        AI processing has not been requested. Enable AI access and save to trigger processing.
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">No {feature} extracted from this entry.</p>
  );
}

function ProcessingBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    not_requested: { label: 'Not processed', variant: 'secondary' },
    pending: { label: 'Pending', variant: 'outline' },
    processing: { label: 'Processing', variant: 'outline' },
    completed: { label: 'Completed', variant: 'default' },
    failed: { label: 'Failed', variant: 'destructive' },
    blocked: { label: 'Blocked', variant: 'secondary' },
  };
  const c = config[status] || config.not_requested;
  return <Badge variant={c.variant} className="text-xs">{c.label}</Badge>;
}

function CollectionBreadcrumbsForDoc({ entry }: { entry: ContentSource }) {
  const { currentWorkspace } = useWorkspace();
  const { data: treeData } = useKnowledgeTree(currentWorkspace?.id ?? null);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  useEffect(() => {
    if (entry.source_type !== 'knowledge') return;
    supabase
      .from('knowledge_documents')
      .select('collection_id')
      .eq('content_source_id', entry.id)
      .maybeSingle()
      .then(({ data }) => setCollectionId(data?.collection_id ?? null));
  }, [entry.id, entry.source_type]);

  if (!treeData || !collectionId) return null;
  const path = getCollectionPath(treeData.collections, collectionId);
  if (path.length === 0) return null;
  return <DocBreadcrumbs collectionPath={path} docTitle={entry.title} />;
}
