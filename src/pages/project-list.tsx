import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  FolderKanban,
  Calendar,
  Archive,
  ArchiveRestore,
  Edit,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Pause,
  Play,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { formatDate } from '@/lib/format';
import type { Project, ProjectStatus } from '@/types';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_VARIANTS: Record<ProjectStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  paused: 'outline',
  completed: 'default',
  archived: 'secondary',
};

export function ProjectListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWorkspace, allWorkspaces, workspaces } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('current');
  const [showArchived, setShowArchived] = useState(false);

  const wsId = workspaceFilter === 'current' && !allWorkspaces && currentWorkspace
    ? currentWorkspace.id
    : null;

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', wsId, statusFilter, showArchived],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*, workspaces(name, icon)')
        .order('created_at', { ascending: false });

      if (showArchived) {
        query = query.not('deleted_at', 'is', null);
      } else {
        query = query.is('deleted_at', null);
      }

      if (wsId) {
        query = query.eq('workspace_id', wsId);
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'archived') {
          query = query.eq('status', 'archived');
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (Project & { workspaces: { name: string; icon: string } | null })[];
    },
  });

  async function updateProjectStatus(id: string, status: ProjectStatus) {
    const payload: Record<string, unknown> = { status };
    if (status === 'completed') payload.completed_at = new Date().toISOString();
    else if (status === 'active') payload.completed_at = null;

    const { error } = await supabase.from('projects').update(payload).eq('id', id);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast({ title: `Project marked as ${STATUS_LABELS[status]}` });
  }

  async function archiveProject(id: string) {
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to archive', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast({ title: 'Project archived' });
  }

  async function restoreProject(id: string) {
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to restore', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast({ title: 'Project restored' });
  }

  async function deleteProject(id: string) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast({ title: 'Project permanently deleted' });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Organize entries, notes, and memories by project</p>
        </div>
        <Button onClick={() => navigate('/projects/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!allWorkspaces && workspaces.length > 1 && (
          <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
            <SelectTrigger className="w-[160px]">
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={showArchived ? 'secondary' : 'outline'}
          onClick={() => setShowArchived(!showArchived)}
          className="shrink-0"
        >
          <Archive className="mr-2 h-4 w-4" />
          {showArchived ? 'Archived' : 'Show archived'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="space-y-2">
          {projects.map((project) => (
            <Card key={project.id} className={project.deleted_at ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/projects/${project.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-teal shrink-0" />
                      <h3 className="truncate text-sm font-medium hover:text-teal">
                        {project.name}
                      </h3>
                    </div>
                    {project.description && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {project.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {project.workspaces && (
                        <span className="flex items-center gap-1">
                          {project.workspaces.icon} {project.workspaces.name}
                        </span>
                      )}
                      {project.target_date && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(project.target_date)}
                          </span>
                        </>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[project.status]} className="text-xs">
                      {STATUS_LABELS[project.status]}
                    </Badge>
                    {project.deleted_at ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => restoreProject(project.id)} title="Restore">
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive" title="Delete permanently">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete project permanently?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. Entries linked to this project will be unlinked.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteProject(project.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}/edit`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {project.status === 'active' && (
                            <DropdownMenuItem onClick={() => updateProjectStatus(project.id, 'paused')}>
                              <Pause className="mr-2 h-4 w-4" />
                              Pause
                            </DropdownMenuItem>
                          )}
                          {project.status === 'paused' && (
                            <DropdownMenuItem onClick={() => updateProjectStatus(project.id, 'active')}>
                              <Play className="mr-2 h-4 w-4" />
                              Resume
                            </DropdownMenuItem>
                          )}
                          {project.status !== 'completed' && (
                            <DropdownMenuItem onClick={() => updateProjectStatus(project.id, 'completed')}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark completed
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => archiveProject(project.id)}>
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">
            {showArchived ? 'No archived projects' : 'No projects yet'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {showArchived ? 'Archived projects will appear here' : 'Create a project to organize your work'}
          </p>
          {!showArchived && (
            <Button className="mt-4" onClick={() => navigate('/projects/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Create project
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
