import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Sparkles,
  X,
  FolderKanban,
  CheckCircle2,
  Clock,
  CloudOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useKnowledgeTree } from '@/hooks/use-knowledge-tree';
import { contentSourceSchema, type ContentSourceValues } from '@/lib/validation/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RichEditor } from '@/components/rich-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/format';
import type { ContentSource, SourceType, Project } from '@/types';
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

interface EntryEditorProps {
  sourceType: SourceType;
}

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface LocalDraft {
  title: string;
  content_text: string;
  content_json: string | null;
  entry_date: string;
  tags: string[];
  workspace_id: string;
  project_id: string | null;
  ai_access: 'allowed' | 'blocked';
  savedAt: number;
}

function getDraftKey(sourceType: SourceType) {
  return `entry_draft_${sourceType}`;
}

function saveDraft(sourceType: SourceType, draft: LocalDraft) {
  try {
    localStorage.setItem(getDraftKey(sourceType), JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable
  }
}

function loadDraft(sourceType: SourceType): LocalDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(sourceType));
    if (!raw) return null;
    return JSON.parse(raw) as LocalDraft;
  } catch {
    return null;
  }
}

function clearDraft(sourceType: SourceType) {
  try {
    localStorage.removeItem(getDraftKey(sourceType));
  } catch {
    // ignore
  }
}

export function EntryEditor({ sourceType }: EntryEditorProps) {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWorkspace, workspaces, allWorkspaces } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [contentJson, setContentJson] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Autosave state
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [draftRestoreOpen, setDraftRestoreOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<LocalDraft | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the form has been dirtied since last autosave
  const isDirtyRef = useRef(false);
  // Prevent autosave firing before initial data loads
  const initializedRef = useRef(false);

  const { data: projects } = useQuery({
    queryKey: ['projects-for-workspace', selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status')
        .eq('workspace_id', selectedWorkspaceId)
        .is('deleted_at', null)
        .in('status', ['active', 'paused', 'completed'])
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!selectedWorkspaceId,
  });

  const { data: existingEntry, isLoading } = useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_sources')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as ContentSource | null;
    },
    enabled: isEditing,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ContentSourceValues>({
    resolver: zodResolver(contentSourceSchema),
    defaultValues: {
      title: '',
      content_text: '',
      entry_date: new Date().toISOString().slice(0, 10),
      tags: [],
      ai_access: 'allowed',
      workspace_id: '',
      source_type: sourceType,
    },
  });

  const { data: knowledgeTree } = useKnowledgeTree(selectedWorkspaceId || null);
  const collectionIdFromUrl = searchParams.get('collection');

  // On mount, check for a saved draft if this is a new entry
  useEffect(() => {
    if (!isEditing) {
      const draft = loadDraft(sourceType);
      if (draft && (draft.title.trim() || draft.content_text.trim())) {
        setPendingDraft(draft);
        setDraftRestoreOpen(true);
      }
    }
  }, [isEditing, sourceType]);

  const hydratedRef = useRef(false);

  // Reset hydration when the id param changes so the form re-populates
  // with the new entry instead of retaining the previous one's values.
  useEffect(() => {
    hydratedRef.current = false;
    initializedRef.current = false;
    setContentJson(null);
    setTags([]);
    setSelectedProjectId(null);
    setSelectedCollectionId(null);
    setValue('title', '');
    setValue('content_text', '');
    setValue('entry_date', new Date().toISOString().slice(0, 10));
    setValue('ai_access', 'allowed');
  }, [id, setValue]);

  useEffect(() => {
    if (existingEntry && !hydratedRef.current) {
      hydratedRef.current = true;
      setValue('title', existingEntry.title);
      setValue('content_text', existingEntry.content_text);
      setValue('entry_date', existingEntry.entry_date);
      setValue('ai_access', existingEntry.ai_access);
      setValue('workspace_id', existingEntry.workspace_id);
      setValue('source_type', existingEntry.source_type);
      setTags(existingEntry.tags || []);
      setContentJson(existingEntry.content_json);
      setSelectedWorkspaceId(existingEntry.workspace_id);
      setSelectedProjectId(existingEntry.project_id);
      if (existingEntry.source_type === 'knowledge') {
        supabase
          .from('knowledge_documents')
          .select('collection_id')
          .eq('content_source_id', existingEntry.id)
          .maybeSingle()
          .then(({ data: kd }) => {
            setSelectedCollectionId(kd?.collection_id ?? null);
          });
      }
      setLastSavedAt(new Date(existingEntry.updated_at));
      initializedRef.current = true;
    } else if (!isEditing) {
      const wsId = searchParams.get('workspace') || (allWorkspaces ? '' : currentWorkspace?.id || '');
      if (wsId) {
        setValue('workspace_id', wsId);
        setSelectedWorkspaceId(wsId);
      }
      const projectId = searchParams.get('project');
      if (projectId) setSelectedProjectId(projectId);
      if (collectionIdFromUrl) setSelectedCollectionId(collectionIdFromUrl);
      initializedRef.current = true;
    }
  }, [existingEntry, isEditing, setValue, currentWorkspace, allWorkspaces, searchParams, collectionIdFromUrl]);

  function restoreDraft(draft: LocalDraft) {
    setValue('title', draft.title);
    setValue('content_text', draft.content_text);
    setValue('entry_date', draft.entry_date);
    setValue('ai_access', draft.ai_access);
    if (draft.workspace_id) {
      setValue('workspace_id', draft.workspace_id);
      setSelectedWorkspaceId(draft.workspace_id);
    }
    setContentJson(draft.content_json);
    setTags(draft.tags);
    setSelectedProjectId(draft.project_id);
    setDraftRestoreOpen(false);
    setPendingDraft(null);
    setLastSavedAt(new Date(draft.savedAt));
    setAutosaveStatus('saved');
  }

  function discardDraft() {
    clearDraft(sourceType);
    setPendingDraft(null);
    setDraftRestoreOpen(false);
  }

  // Immediately persist the current form state. For new entries this writes to
  // localStorage synchronously; for existing entries it fires an async Supabase
  // update. Called by the debounced autosave and on unmount/page-close.
  const flushAutosave = useCallback(() => {
    if (!initializedRef.current || !isDirtyRef.current) return;
    isDirtyRef.current = false;
    const values = getValues();
    const currentTitle = values.title ?? '';
    const currentText = values.content_text ?? '';

    if (!isEditing) {
      if (!currentTitle.trim() && !currentText.trim()) return;
      const draft: LocalDraft = {
        title: currentTitle,
        content_text: currentText,
        content_json: contentJson,
        entry_date: values.entry_date,
        tags,
        workspace_id: selectedWorkspaceId,
        project_id: selectedProjectId,
        ai_access: values.ai_access,
        savedAt: Date.now(),
      };
      saveDraft(sourceType, draft);
      setLastSavedAt(new Date());
      setAutosaveStatus('saved');
    } else {
      if (!id) return;
      setAutosaveStatus('saving');
      supabase
        .from('content_sources')
        .update({
          title: currentTitle,
          content_text: currentText,
          content_json: contentJson,
          entry_date: values.entry_date,
          tags,
          workspace_id: selectedWorkspaceId,
          project_id: selectedProjectId,
        })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            setAutosaveStatus('error');
          } else {
            setLastSavedAt(new Date());
            setAutosaveStatus('saved');
          }
        });
    }
  }, [isEditing, id, contentJson, tags, selectedWorkspaceId, selectedProjectId, sourceType, getValues]);

  // Debounced autosave — called whenever watched fields change
  const scheduleAutosave = useCallback(() => {
    if (!initializedRef.current) return;
    isDirtyRef.current = true;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => flushAutosave(), 1500);
  }, [flushAutosave]);

  // Watch title and entry_date for changes to trigger autosave
  const titleValue = watch('title');
  const entryDateValue = watch('entry_date');

  useEffect(() => {
    scheduleAutosave();
  }, [titleValue, entryDateValue, scheduleAutosave]);

  // Also trigger autosave when contentJson, tags, workspace or project changes
  useEffect(() => {
    scheduleAutosave();
  }, [contentJson, tags, selectedWorkspaceId, selectedProjectId, scheduleAutosave]);

  // Flush pending save on unmount (so navigating away within the debounce
  // window still preserves the draft) and on tab close / page hide.
  useEffect(() => {
    const onBeforeUnload = () => flushAutosave();
    window.addEventListener('beforeunload', onBeforeUnload);
    const onPageHide = () => flushAutosave();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      flushAutosave();
    };
    // flushAutosave is stable enough via useCallback deps; we intentionally
    // only want this to run on mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  async function onSubmit(values: ContentSourceValues) {
    if (!selectedWorkspaceId) {
      toast({ title: 'Please select a workspace', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const projectId = selectedProjectId || null;

    if (isEditing) {
      const contentChanged = existingEntry?.content_text !== values.content_text || existingEntry?.title !== values.title;
      const shouldReprocess = contentChanged && values.ai_access === 'allowed';
      const processingStatus = shouldReprocess
        ? 'pending'
        : values.ai_access === 'blocked'
        ? 'blocked'
        : existingEntry?.processing_status || 'not_requested';

      const { error } = await supabase
        .from('content_sources')
        .update({
          title: values.title,
          content_text: values.content_text,
          content_json: contentJson,
          entry_date: values.entry_date,
          tags,
          ai_access: values.ai_access,
          workspace_id: selectedWorkspaceId,
          project_id: projectId,
          processing_status: processingStatus,
          processing_error: shouldReprocess ? null : existingEntry?.processing_error,
        })
        .eq('id', id!);
      setSaving(false);
      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['entry', id] });
      queryClient.invalidateQueries({ queryKey: ['recent-entries'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-tree'] });
      toast({ title: 'Entry updated' });

      if (sourceType === 'knowledge') {
        await supabase
          .from('knowledge_documents')
          .update({ collection_id: selectedCollectionId })
          .eq('content_source_id', id!);
      }

      if (shouldReprocess) {
        triggerProcessing(id!);
      } else {
        navigate(`/entries/${id}`);
      }
    } else {
      const processingStatus = values.ai_access === 'allowed' ? 'pending' : 'blocked';
      const { data, error } = await supabase
        .from('content_sources')
        .insert({
          title: values.title,
          content_text: values.content_text,
          content_json: contentJson,
          entry_date: values.entry_date,
          tags,
          ai_access: values.ai_access,
          workspace_id: selectedWorkspaceId,
          project_id: projectId,
          source_type: sourceType,
          processing_status: processingStatus,
        })
        .select('id')
        .single();
      setSaving(false);
      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
        return;
      }
      clearDraft(sourceType);
      isDirtyRef.current = false;
      initializedRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['recent-entries'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-tree'] });
      toast({ title: 'Entry created' });

      if (sourceType === 'knowledge') {
        await supabase.from('knowledge_documents').insert({
          content_source_id: data.id,
          collection_id: selectedCollectionId,
        });
      }

      if (values.ai_access === 'allowed') {
        triggerProcessing(data.id);
      } else {
        navigate(`/entries/${data.id}`);
      }
    }
  }

  async function triggerProcessing(entryId: string) {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        navigate(`/entries/${entryId}`);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-entry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ content_source_id: entryId }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast({
          title: 'AI processing queued with issues',
          description: err.error || 'Processing will be retried',
          variant: 'destructive',
        });
      }
    } catch {
      // Non-blocking — entry is saved, processing can be retried
    }
    navigate(`/entries/${entryId}`);
  }

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

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pageTitle = isEditing
    ? `Edit ${sourceType === 'journal' ? 'journal entry' : 'knowledge note'}`
    : `New ${sourceType === 'journal' ? 'journal entry' : 'knowledge note'}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      {/* Draft restore dialog */}
      <AlertDialog open={draftRestoreOpen} onOpenChange={setDraftRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore unsaved draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved draft{pendingDraft?.title ? ` titled "${pendingDraft.title}"` : ''} from{' '}
              {pendingDraft ? new Date(pendingDraft.savedAt).toLocaleString() : ''}. Would you like to restore it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Discard draft</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDraft && restoreDraft(pendingDraft)}>
              Restore draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          {/* Autosave status indicator */}
          <AutosaveIndicator
            status={autosaveStatus}
            lastSavedAt={lastSavedAt}
            isNew={!isEditing}
          />
          {isEditing && (
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
                    This will move the entry to trash. You can restore it later from the trash.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <h1 className="text-xl font-bold">{pageTitle}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            placeholder={sourceType === 'journal' ? 'What happened today?' : 'Note title'}
            {...register('title')}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        {/* Workspace + Project + Date */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="workspace">Workspace</Label>
            <Select
              value={selectedWorkspaceId}
              onValueChange={(v) => {
                setSelectedWorkspaceId(v);
                setValue('workspace_id', v);
                setSelectedProjectId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.filter((w) => !w.is_archived).map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.icon} {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.workspace_id && (
              <p className="text-sm text-destructive">{errors.workspace_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry_date">Date</Label>
            <Input id="entry_date" type="date" {...register('entry_date')} />
            {errors.entry_date && (
              <p className="text-sm text-destructive">{errors.entry_date.message}</p>
            )}
          </div>
        </div>

        {/* Project */}
        <div className="space-y-2">
          <Label htmlFor="project">Project (optional)</Label>
          <Select
            value={selectedProjectId || 'none'}
            onValueChange={(v) => setSelectedProjectId(v === 'none' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <FolderKanban className="mr-2 inline h-3.5 w-3.5" />
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Collection (knowledge only) */}
        {sourceType === 'knowledge' && (
          <div className="space-y-2">
            <Label htmlFor="collection">Collection (optional)</Label>
            <Select
              value={selectedCollectionId || 'none'}
              onValueChange={(v) => setSelectedCollectionId(v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No collection (root)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No collection (root)</SelectItem>
                {knowledgeTree?.collections.filter((c) => !c.is_archived).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon ? `${c.icon} ` : ''}{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="content_text">
            {sourceType === 'journal' ? 'Your entry' : 'Note content'}
          </Label>
          <RichEditor
            value={contentJson ?? existingEntry?.content_json ?? ''}
            onChange={(json, text) => {
              setContentJson(json);
              setValue('content_text', text);
              scheduleAutosave();
            }}
            placeholder={sourceType === 'journal' ? 'Write your thoughts...' : 'Write your note...'}
            workspaceId={selectedWorkspaceId || undefined}
            contentSourceId={id}
            variant={sourceType}
          />
          {errors.content_text && (
            <p className="text-sm text-destructive">{errors.content_text.message}</p>
          )}
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="tags"
              placeholder="Add a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={addTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1 rounded-full hover:bg-destructive/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* AI Access */}
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal" />
                <Label htmlFor="ai_access" className="cursor-pointer">
                  AI access
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Allow AI to process this entry for insights, entities, and memories
              </p>
            </div>
            <Switch
              id="ai_access"
              checked={watch('ai_access') === 'allowed'}
              onCheckedChange={(checked) => setValue('ai_access', checked ? 'allowed' : 'blocked')}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {isEditing ? 'Save changes' : 'Save entry'}
          </Button>
        </div>
      </form>

      {isEditing && existingEntry && (
        <div className="pt-4 text-xs text-muted-foreground">
          Created {formatDate(existingEntry.created_at)} · Updated {formatDate(existingEntry.updated_at)}
        </div>
      )}
    </div>
  );
}

function AutosaveIndicator({
  status,
  lastSavedAt,
  isNew,
}: {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  isNew: boolean;
}) {
  if (status === 'idle' && !lastSavedAt) return null;

  const label = isNew ? 'Draft saved' : 'Autosaved';

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving...
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CloudOff className="h-3.5 w-3.5" />
        Save failed
      </span>
    );
  }

  if (status === 'saved' && lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-teal" />
        {label} {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
  }

  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {label} {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
  }

  return null;
}
