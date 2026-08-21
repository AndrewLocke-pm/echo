import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  CheckCircle2,
  XCircle,
  Edit,
  Filter,
  Calendar,
  FileText,
  FolderKanban,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate, truncate } from '@/lib/format';
import type { Memory, MemoryStatus, MemoryType } from '@/types';

const STATUS_LABELS: Record<MemoryStatus, string> = {
  suggested: 'Suggested',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
  superseded: 'Superseded',
};

const STATUS_VARIANTS: Record<MemoryStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  suggested: 'outline',
  approved: 'default',
  rejected: 'destructive',
  archived: 'secondary',
  superseded: 'secondary',
};

const TYPE_LABELS: Record<MemoryType, string> = {
  preference: 'Preference',
  goal: 'Goal',
  fact: 'Fact',
  relationship: 'Relationship',
  lesson: 'Lesson',
  project_context: 'Project Context',
  timeline_event: 'Timeline Event',
  current_state: 'Current State',
  habit: 'Habit',
};

interface MemoryWithSource extends Memory {
  source_entry_title?: string | null;
  source_entry_date?: string | null;
  source_excerpt?: string | null;
  project_name?: string | null;
}

export function MemoryInboxPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWorkspace, allWorkspaces, workspaces } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>('suggested');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('current');
  const [editingMemory, setEditingMemory] = useState<MemoryWithSource | null>(null);
  const [editText, setEditText] = useState('');

  const wsId = workspaceFilter === 'current' && !allWorkspaces && currentWorkspace
    ? currentWorkspace.id
    : null;

  const { data: projects } = useQuery({
    queryKey: ['projects-for-filter', wsId],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (wsId) query = query.eq('workspace_id', wsId);
      const { data, error } = await query;
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: memories, isLoading } = useQuery({
    queryKey: ['memory-inbox', wsId, statusFilter, typeFilter, projectFilter],
    queryFn: async () => {
      let query = supabase
        .from('memories')
        .select(`
          *,
          memory_sources(
            source_excerpt,
            content_sources!inner(id, title, entry_date)
          ),
          projects(name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (wsId) query = query.eq('workspace_id', wsId);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (typeFilter !== 'all') query = query.eq('memory_type', typeFilter);
      if (projectFilter !== 'all') query = query.eq('project_id', projectFilter);

      const { data, error } = await query;
      if (error) throw error;

      return (data as unknown as Array<Record<string, unknown>>).map((row) => {
        const sources = row.memory_sources as Array<{
          source_excerpt: string | null;
          content_sources: { id: string; title: string; entry_date: string } | null;
        }> | null;
        const firstSource = sources?.[0];
        const project = row.projects as { name: string } | null;

        return {
          ...row,
          source_entry_title: firstSource?.content_sources?.title ?? null,
          source_entry_date: firstSource?.content_sources?.entry_date ?? null,
          source_excerpt: firstSource?.source_excerpt ?? null,
          project_name: project?.name ?? null,
        } as MemoryWithSource;
      });
    },
  });

  async function approveMemory(id: string) {
    const { error } = await supabase
      .from('memories')
      .update({ status: 'approved', last_confirmed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['memory-inbox'] });
    toast({ title: 'Memory approved' });
  }

  async function rejectMemory(id: string) {
    const { error } = await supabase
      .from('memories')
      .update({ status: 'rejected' })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to reject', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['memory-inbox'] });
    toast({ title: 'Memory rejected' });
  }

  async function editAndApprove() {
    if (!editingMemory) return;
    const { error } = await supabase
      .from('memories')
      .update({
        memory_text: editText,
        normalised_text: editText.toLowerCase().trim().replace(/\s+/g, ' '),
        status: 'approved',
        last_confirmed_at: new Date().toISOString(),
      })
      .eq('id', editingMemory.id);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['memory-inbox'] });
    setEditingMemory(null);
    toast({ title: 'Memory edited and approved' });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Memory Inbox</h1>
        <p className="text-sm text-muted-foreground">Review and approve AI-suggested memories</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="suggested">Suggested</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="preference">Preference</SelectItem>
            <SelectItem value="goal">Goal</SelectItem>
            <SelectItem value="fact">Fact</SelectItem>
            <SelectItem value="relationship">Relationship</SelectItem>
            <SelectItem value="lesson">Lesson</SelectItem>
            <SelectItem value="project_context">Project Context</SelectItem>
            <SelectItem value="timeline_event">Timeline Event</SelectItem>
            <SelectItem value="current_state">Current State</SelectItem>
            <SelectItem value="habit">Habit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Memory list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : memories && memories.length > 0 ? (
        <div className="space-y-2">
          {memories.map((mem) => (
            <Card key={mem.id} className={mem.status === 'approved' ? 'border-teal/30' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-teal shrink-0" />
                      <p className="text-sm font-medium">{mem.memory_text}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={STATUS_VARIANTS[mem.status]} className="text-xs">
                        {STATUS_LABELS[mem.status]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[mem.memory_type]}
                      </Badge>
                      <span>Confidence: {Math.round(mem.confidence * 100)}%</span>
                      {mem.project_name && (
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3 w-3" />
                          {mem.project_name}
                        </span>
                      )}
                    </div>
                    {mem.source_entry_title && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span className="truncate">{mem.source_entry_title}</span>
                        {mem.source_entry_date && (
                          <>
                            <span>·</span>
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(mem.source_entry_date)}</span>
                          </>
                        )}
                      </div>
                    )}
                    {mem.source_excerpt && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{truncate(mem.source_excerpt, 150)}"
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {mem.status === 'suggested' && (
                      <>
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
                          className="h-7 text-xs"
                          onClick={() => {
                            setEditingMemory(mem);
                            setEditText(mem.memory_text);
                          }}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Edit & approve
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
                      </>
                    )}
                    {mem.status === 'approved' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setEditingMemory(mem);
                          setEditText(mem.memory_text);
                        }}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Brain className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No memories found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusFilter === 'suggested'
              ? 'Process entries with AI access enabled to generate memory suggestions'
              : 'Try changing the filters to see more memories'}
          </p>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingMemory} onOpenChange={(open) => !open && setEditingMemory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit memory</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[80px]"
            placeholder="Memory text"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={editAndApprove} disabled={!editText.trim()}>
              Save & approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
