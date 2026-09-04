import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Edit,
  FolderKanban,
  Calendar,
  CheckCircle2,
  Gavel,
  Handshake,
  AlertCircle,
  HelpCircle,
  ListTodo,
  Lightbulb,
  Brain,
  Tag,
  FileText,
  Activity,
  Paperclip,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatRelative, truncate } from '@/lib/format';
import type { Project, ContentSource, ExtractedItem, Memory, Entity, ProjectStatus, ProjectFile, AiAccess } from '@/types';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

const ITEM_ICONS = {
  decision: Gavel,
  commitment: Handshake,
  concern: AlertCircle,
  question: HelpCircle,
  task: ListTodo,
  idea: Lightbulb,
};

const ITEM_LABELS: Record<string, string> = {
  decision: 'Decisions',
  commitment: 'Commitments',
  concern: 'Concerns',
  question: 'Open Questions',
  task: 'Tasks',
  idea: 'Ideas',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') return '📃';
  return '📎';
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, workspaces(name, icon)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as (Project & { workspaces: { name: string; icon: string } | null }) | null;
    },
    enabled: !!id,
  });

  const { data: entries } = useQuery({
    queryKey: ['project-entries', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_sources')
        .select('id, title, content_text, source_type, entry_date, processing_status, created_at')
        .eq('project_id', id!)
        .is('deleted_at', null)
        .order('entry_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as ContentSource[];
    },
    enabled: !!id,
  });

  const { data: projectFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['project-files', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*, content_sources(ai_access)')
        .in(
          'content_source_id',
          (
            await supabase
              .from('content_sources')
              .select('id')
              .eq('project_id', id!)
              .is('deleted_at', null)
          ).data?.map((r) => r.id) ?? []
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        ai_access: row.content_sources?.ai_access ?? 'allowed',
      })) as ProjectFile[];
    },
    enabled: !!id,
  });

  const { data: items } = useQuery({
    queryKey: ['project-items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extracted_items')
        .select('*')
        .eq('project_id', id!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ExtractedItem[];
    },
    enabled: !!id,
  });

  const { data: memories } = useQuery({
    queryKey: ['project-memories', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memories')
        .select('*')
        .eq('project_id', id!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Memory[];
    },
    enabled: !!id,
  });

  const { data: entities } = useQuery({
    queryKey: ['project-entities', id],
    queryFn: async () => {
      const { data: entryIds } = await supabase
        .from('content_sources')
        .select('id')
        .eq('project_id', id!)
        .is('deleted_at', null);

      if (!entryIds || entryIds.length === 0) return [];

      const ids = entryIds.map((e) => e.id);
      const { data, error } = await supabase
        .from('entry_entities')
        .select('entity_id, entities:entities(id, canonical_name, entity_type, normalised_name)')
        .in('content_source_id', ids);

      if (error) throw error;

      const rows = data as unknown as Array<{ entity_id: string; entities: Entity | null }>;

      const entityMap = new Map<string, { entity: Entity; count: number }>();
      for (const row of rows) {
        if (row.entities) {
          const existing = entityMap.get(row.entities.id);
          if (existing) {
            existing.count++;
          } else {
            entityMap.set(row.entities.id, { entity: row.entities, count: 1 });
          }
        }
      }

      return Array.from(entityMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
    enabled: !!id,
  });

  async function updateItemStatus(itemId: string, status: string) {
    const { error } = await supabase
      .from('extracted_items')
      .update({ status })
      .eq('id', itemId);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['project-items', id] });
    toast({ title: 'Item updated' });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !project || !user) return;
    e.target.value = '';

    setUploading(true);
    try {
      const filePath = `${project.workspace_id}/${id}/${Date.now()}_${file.name}`;

      const { error: storageError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, { contentType: file.type });

      if (storageError) {
        toast({ title: 'Upload failed', description: storageError.message, variant: 'destructive' });
        return;
      }

      const { data: cs, error: csError } = await supabase
        .from('content_sources')
        .insert({
          user_id: user.id,
          workspace_id: project.workspace_id,
          project_id: id,
          source_type: 'knowledge',
          title: file.name,
          content_text: '',
          entry_date: new Date().toISOString().slice(0, 10),
          tags: [],
          ai_access: 'allowed',
          processing_status: 'not_requested',
        })
        .select('id')
        .single();

      if (csError) {
        await supabase.storage.from('attachments').remove([filePath]);
        toast({ title: 'Failed to save file record', description: csError.message, variant: 'destructive' });
        return;
      }

      const { error: attError } = await supabase.from('attachments').insert({
        user_id: user.id,
        workspace_id: project.workspace_id,
        content_source_id: cs.id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.name.split('.').pop()?.toLowerCase() || 'bin',
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_bucket: 'attachments',
      });

      if (attError) {
        await supabase.storage.from('attachments').remove([filePath]);
        await supabase.from('content_sources').delete().eq('id', cs.id);
        toast({ title: 'Failed to save attachment', description: attError.message, variant: 'destructive' });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['project-files', id] });
      toast({ title: 'File uploaded', description: file.name });
    } finally {
      setUploading(false);
    }
  }

  async function toggleAiAccess(file: ProjectFile) {
    setTogglingId(file.id);
    const newAccess: AiAccess = file.ai_access === 'allowed' ? 'blocked' : 'allowed';
    const { error } = await supabase
      .from('content_sources')
      .update({ ai_access: newAccess })
      .eq('id', file.content_source_id);
    setTogglingId(null);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['project-files', id] });
  }

  async function deleteFile(file: ProjectFile) {
    setDeletingId(file.id);
    const { error: storageError } = await supabase.storage
      .from('attachments')
      .remove([file.file_path]);

    if (storageError) {
      toast({ title: 'Failed to delete file', description: storageError.message, variant: 'destructive' });
      setDeletingId(null);
      return;
    }

    await supabase.from('content_sources').delete().eq('id', file.content_source_id);
    setDeletingId(null);
    queryClient.invalidateQueries({ queryKey: ['project-files', id] });
    toast({ title: 'File deleted' });
  }

  async function downloadFile(file: ProjectFile) {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(file.file_path, 60);
    if (error || !data) {
      toast({ title: 'Could not get download link', description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
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

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-medium">Project not found</h2>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/projects')}>
          Back to projects
        </Button>
      </div>
    );
  }

  const journalEntries = entries?.filter((e) => e.source_type === 'journal') || [];
  const knowledgeNotes = entries?.filter((e) => e.source_type === 'knowledge') || [];
  const approvedMemories = memories?.filter((m) => m.status === 'approved') || [];
  const suggestedMemories = memories?.filter((m) => m.status === 'suggested') || [];

  const itemsByType = (items || []).reduce<Record<string, ExtractedItem[]>>((acc, item) => {
    if (!acc[item.item_type]) acc[item.item_type] = [];
    acc[item.item_type].push(item);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${id}/edit`)}>
          <Edit className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {project.workspaces && (
            <span>{project.workspaces.icon} {project.workspaces.name}</span>
          )}
          <span>·</span>
          <Badge variant="outline" className="text-xs">{STATUS_LABELS[project.status]}</Badge>
        </div>
        <h1 className="mt-2 text-2xl font-bold flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-teal" />
          {project.name}
        </h1>
        {project.description && (
          <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {project.start_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Started {formatDate(project.start_date)}
            </span>
          )}
          {project.target_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Target {formatDate(project.target_date)}
            </span>
          )}
          {project.completed_at && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Completed {formatDate(project.completed_at)}
            </span>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="files" className="text-xs">
            Files
            {projectFiles && projectFiles.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{projectFiles.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="entries" className="text-xs">Entries</TabsTrigger>
          <TabsTrigger value="items" className="text-xs">Items</TabsTrigger>
          <TabsTrigger value="memories" className="text-xs">Memories</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-teal" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(entries || []).slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-xs">
                    <button
                      onClick={() => navigate(`/entries/${entry.id}`)}
                      className="truncate text-left hover:text-teal"
                    >
                      {entry.title || 'Untitled'}
                    </button>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {formatRelative(entry.created_at)}
                    </span>
                  </div>
                ))}
                {(!entries || entries.length === 0) && (
                  <p className="text-xs text-muted-foreground">No activity yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Tag className="h-4 w-4 text-teal" />
                  Frequently Mentioned Entities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {entities && entities.length > 0 ? (
                  entities.map(({ entity }) => (
                    <div key={entity.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{entity.canonical_name}</span>
                      <Badge variant="secondary" className="text-xs ml-2">{entity.entity_type}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No entities extracted yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Files */}
        <TabsContent value="files" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Upload files to this project. Toggle AI access to control whether each file can be used in AI responses.
            </p>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUpload}
                accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.svg,.docx,.xlsx,.pptx,.json,.zip"
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {uploading ? 'Uploading...' : 'Upload file'}
              </Button>
            </div>
          </div>

          {filesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !projectFiles || projectFiles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Paperclip className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">No files yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload files to keep project assets organised
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload first file
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {projectFiles.map((file) => (
                <Card key={file.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="text-2xl shrink-0">{fileIcon(file.mime_type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.file_size)} · {formatRelative(file.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        {file.ai_access === 'allowed' ? (
                          <Eye className="h-3.5 w-3.5 text-teal" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <Label htmlFor={`ai-${file.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                          AI
                        </Label>
                        <Switch
                          id={`ai-${file.id}`}
                          checked={file.ai_access === 'allowed'}
                          onCheckedChange={() => toggleAiAccess(file)}
                          disabled={togglingId === file.id}
                          className="scale-75"
                        />
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => downloadFile(file)}
                        title="Download"
                        className="h-8 w-8"
                      >
                        <Download className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteFile(file)}
                        disabled={deletingId === file.id}
                        title="Delete"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        {deletingId === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Entries */}
        <TabsContent value="entries" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Journal Entries ({journalEntries.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {journalEntries.length > 0 ? (
                journalEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => navigate(`/entries/${entry.id}`)}
                    className="block w-full rounded-md border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-secondary/50"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{entry.title || 'Untitled'}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {truncate(entry.content_text, 100)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.entry_date)}</p>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No journal entries linked to this project</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Knowledge Notes ({knowledgeNotes.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {knowledgeNotes.length > 0 ? (
                knowledgeNotes.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => navigate(`/entries/${entry.id}`)}
                    className="block w-full rounded-md border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-secondary/50"
                  >
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-3.5 w-3.5 text-amber" />
                      <span className="truncate text-sm font-medium">{entry.title || 'Untitled'}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {truncate(entry.content_text, 100)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.entry_date)}</p>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No knowledge notes linked to this project</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Items */}
        <TabsContent value="items" className="mt-4 space-y-4">
          {(['decision', 'commitment', 'concern', 'question', 'task', 'idea'] as const).map((type) => {
            const typeItems = itemsByType[type] || [];
            const Icon = ITEM_ICONS[type];
            return (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-teal" />
                    {ITEM_LABELS[type]} ({typeItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {typeItems.length > 0 ? (
                    typeItems.map((item) => (
                      <div key={item.id} className="rounded-md border border-border p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm">{item.content}</p>
                          <Badge
                            variant={item.status === 'open' ? 'outline' : 'secondary'}
                            className="text-xs shrink-0"
                          >
                            {item.status}
                          </Badge>
                        </div>
                        {item.source_excerpt && (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            "{truncate(item.source_excerpt, 150)}"
                          </p>
                        )}
                        {item.due_date && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Due: {formatDate(item.due_date)}
                          </p>
                        )}
                        <div className="mt-2 flex gap-1">
                          {item.status === 'open' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemStatus(item.id, 'completed')}
                                className="text-xs"
                              >
                                Mark done
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => updateItemStatus(item.id, 'dismissed')}
                                className="text-xs"
                              >
                                Dismiss
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/entries/${item.content_source_id}`)}
                            className="text-xs"
                          >
                            View source
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No {ITEM_LABELS[type].toLowerCase()} extracted yet</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Memories */}
        <TabsContent value="memories" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Brain className="h-4 w-4 text-teal" />
                Suggested Memories ({suggestedMemories.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {suggestedMemories.length > 0 ? (
                suggestedMemories.map((mem) => (
                  <div key={mem.id} className="rounded-md border border-border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{mem.memory_text}</p>
                      <Badge variant="outline" className="text-xs shrink-0">{mem.memory_type}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confidence: {Math.round(mem.confidence * 100)}%
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No suggested memories for this project</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-teal" />
                Approved Memories ({approvedMemories.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {approvedMemories.length > 0 ? (
                approvedMemories.map((mem) => (
                  <div key={mem.id} className="rounded-md border border-border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{mem.memory_text}</p>
                      <Badge variant="default" className="text-xs shrink-0">{mem.memory_type}</Badge>
                    </div>
                    {mem.last_confirmed_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Confirmed {formatRelative(mem.last_confirmed_at)}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No approved memories for this project</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
