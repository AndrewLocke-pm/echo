import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAuth } from '@/hooks/use-auth';
import { projectSchema, type ProjectValues } from '@/lib/validation/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/types';

export function ProjectEditor() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWorkspace, workspaces } = useWorkspace();
  const { user } = useAuth();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: existingProject, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as Project | null;
    },
    enabled: isEditing,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      workspace_id: '',
      status: 'active',
      start_date: '',
      target_date: '',
    },
  });

  const status = watch('status');

  useEffect(() => {
    if (existingProject) {
      setValue('name', existingProject.name);
      setValue('description', existingProject.description || '');
      setValue('workspace_id', existingProject.workspace_id);
      setValue('status', existingProject.status);
      setValue('start_date', existingProject.start_date || '');
      setValue('target_date', existingProject.target_date || '');
      setSelectedWorkspaceId(existingProject.workspace_id);
    } else if (!isEditing) {
      const wsId = currentWorkspace?.id || '';
      if (wsId) {
        setValue('workspace_id', wsId);
        setSelectedWorkspaceId(wsId);
      }
    }
  }, [existingProject, isEditing, setValue, currentWorkspace]);

  async function onSubmit(values: ProjectValues) {
    if (!selectedWorkspaceId) {
      toast({ title: 'Please select a workspace', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: values.name,
      description: values.description || null,
      workspace_id: selectedWorkspaceId,
      status: values.status,
      start_date: values.start_date || null,
      target_date: values.target_date || null,
    };

    if (isEditing) {
      const { error } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id!);
      setSaving(false);
      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast({ title: 'Project updated' });
      navigate(`/projects/${id}`);
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...payload, user_id: user!.id })
        .select('id')
        .single();
      setSaving(false);
      if (error) {
        toast({ title: 'Failed to create', description: error.message, variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project created' });
      navigate(`/projects/${data.id}`);
    }
  }

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="text-xl font-bold">
        {isEditing ? 'Edit project' : 'New project'}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Project name" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="workspace">Workspace</Label>
          <Select
            value={selectedWorkspaceId}
            onValueChange={(v) => {
              setSelectedWorkspaceId(v);
              setValue('workspace_id', v);
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
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            placeholder="What is this project about?"
            className="min-h-[80px]"
            {...register('description')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setValue('status', v as ProjectValues['status'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">Start date</Label>
            <Input id="start_date" type="date" {...register('start_date')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_date">Target date</Label>
            <Input id="target_date" type="date" {...register('target_date')} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {isEditing ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </form>
    </div>
  );
}
