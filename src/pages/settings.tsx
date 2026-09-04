import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  User,
  FolderKanban,
  Shield,
  Plus,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useWorkspace } from '@/hooks/use-workspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import { WORKSPACE_ICONS, WORKSPACE_COLOURS } from '@/lib/format';
import type { Workspace } from '@/types';

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';
  const { profile, user, refreshProfile } = useAuth();
  const { workspaces, refreshWorkspaces } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingWs, setEditingWs] = useState<Workspace | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
  }, [profile]);

  async function saveProfile() {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', user!.id);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      return;
    }
    refreshProfile();
    toast({ title: 'Profile updated' });
  }

  async function toggleArchive(ws: Workspace) {
    const { error } = await supabase
      .from('workspaces')
      .update({ is_archived: !ws.is_archived })
      .eq('id', ws.id);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    refreshWorkspaces();
    toast({ title: ws.is_archived ? 'Workspace restored' : 'Workspace archived' });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="text-xs sm:text-sm">
            <User className="mr-1 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="text-xs sm:text-sm">
            <FolderKanban className="mr-1 h-4 w-4" />
            Workspaces
          </TabsTrigger>
          <TabsTrigger value="privacy" className="text-xs sm:text-sm">
            <Shield className="mr-1 h-4 w-4" />
            Privacy
          </TabsTrigger>
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ''} disabled />
              </div>
              <Button onClick={saveProfile} disabled={displayName === profile?.display_name}>
                Save changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workspaces tab */}
        <TabsContent value="workspaces" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your workspaces</h2>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New workspace
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New workspace</DialogTitle>
                </DialogHeader>
                <WorkspaceForm
                  onSaved={() => {
                    setCreateOpen(false);
                    refreshWorkspaces();
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {workspaces.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">No workspaces yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a workspace to start organizing your entries
                  </p>
                </CardContent>
              </Card>
            ) : (
              workspaces.map((ws) => (
                <Card key={ws.id} className={ws.is_archived ? 'opacity-60' : ''}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
                        style={{ backgroundColor: `${ws.colour}20` }}
                      >
                        {ws.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{ws.name}</span>
                          {ws.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
                          {ws.is_archived && <Badge variant="secondary" className="text-xs">Archived</Badge>}
                        </div>
                        {ws.description && (
                          <p className="truncate text-xs text-muted-foreground">{ws.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingWs(ws)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        {editingWs?.id === ws.id && (
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit workspace</DialogTitle>
                            </DialogHeader>
                            <WorkspaceForm
                              workspace={editingWs}
                              onSaved={() => {
                                setEditingWs(null);
                                refreshWorkspaces();
                              }}
                            />
                          </DialogContent>
                        )}
                      </Dialog>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleArchive(ws)}
                        title={ws.is_archived ? 'Restore' : 'Archive'}
                      >
                        {ws.is_archived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </Button>
                      <DeleteWorkspaceDialog
                        workspace={ws}
                        onDeleted={() => {
                          refreshWorkspaces();
                          queryClient.invalidateQueries({ queryKey: ['workspace-count'] });
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Privacy tab */}
        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-teal" />
                Privacy & AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="space-y-3">
                <p>
                  <strong className="text-foreground">Your data is stored in Supabase.</strong>{' '}
                  The application's memory lives in your database, not in consumer AI chat history.
                </p>
                <p>
                  <strong className="text-foreground">AI providers receive only selected retrieved context.</strong>{' '}
                  Your content is only sent to AI providers through Edge Functions, never directly from the browser.
                </p>
                <p>
                  <strong className="text-foreground">You control what can be sent to AI.</strong>{' '}
                  Every entry has an AI access toggle. Blocked entries are never sent to AI providers.
                </p>
                <p>
                  <strong className="text-foreground">Consumer AI memory is not imported.</strong>{' '}
                  ChatGPT and Claude memory are not automatically imported.
                </p>
                <p>
                  <strong className="text-foreground">Deleting sources affects future AI retrieval.</strong>{' '}
                  Deleted entries are excluded from search and AI processing.
                </p>
                <p>
                  <strong className="text-foreground">Memories can be edited or removed.</strong>{' '}
                  You have full control over your extracted memories.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Data export</p>
                  <p className="text-xs text-muted-foreground">Export your data (coming soon)</p>
                </div>
                <Button variant="outline" size="sm" disabled>
                  Export
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">Delete account</p>
                  <p className="text-xs text-muted-foreground">Permanently delete your account and data</p>
                </div>
                <Button variant="outline" size="sm" className="text-destructive" disabled>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeleteWorkspaceDialog({
  workspace,
  onDeleted,
}: {
  workspace: Workspace;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmText === workspace.name;

  const loadEntryCount = useCallback(async () => {
    setLoadingCount(true);
    const { data, error } = await supabase
      .rpc('workspace_entry_count', { ws_id: workspace.id });
    if (error) {
      setEntryCount(0);
    } else {
      setEntryCount(data as number);
    }
    setLoadingCount(false);
  }, [workspace.id]);

  useEffect(() => {
    if (open) {
      setConfirmText('');
      loadEntryCount();
    }
  }, [open, loadEntryCount]);

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('workspaces').delete().eq('id', workspace.id);
    setDeleting(false);
    if (error) {
      const msg = error.message;
      if (msg.includes('restrict') || msg.includes('foreign key')) {
        toast({
          title: 'Cannot delete workspace',
          description: `This workspace still contains ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}. Delete or move all entries first, or archive the workspace instead.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Failed to delete', description: msg, variant: 'destructive' });
      }
      return;
    }
    setOpen(false);
    toast({ title: 'Workspace permanently deleted' });
    onDeleted();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Permanently delete "{workspace.name}"?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <span>
              {loadingCount
                ? 'Counting entries...'
                : entryCount !== null && entryCount > 0
                ? `This workspace contains ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}. ` +
                  'The database prevents deletion while entries exist. Delete or move all entries first, or archive the workspace instead.'
                : 'This workspace has no entries. Deletion is permanent and cannot be undone.'}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {entryCount !== null && entryCount === 0 && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-name" className="text-sm font-medium">
              Type <strong>{workspace.name}</strong> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={workspace.name}
              className="border-destructive/50"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting || (entryCount !== null && entryCount > 0) || (entryCount === 0 && !canDelete)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Deleting...' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function WorkspaceForm({
  workspace,
  onSaved,
}: {
  workspace?: Workspace;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(workspace?.name || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [icon, setIcon] = useState(workspace?.icon || '📁');
  const [colour, setColour] = useState(workspace?.colour || '#0d9488');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), description: description.trim() || null, icon, colour };

    if (workspace) {
      const { error } = await supabase
        .from('workspaces')
        .update(payload)
        .eq('id', workspace.id);
      setSaving(false);
      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Workspace updated' });
    } else {
      const { error } = await supabase.from('workspaces').insert({
        ...payload,
        user_id: user.id,
      });
      setSaving(false);
      if (error) {
        toast({ title: 'Failed to create', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Workspace created' });
    }
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ws-name">Name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Personal, Work, Health"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ws-desc">Description (optional)</Label>
        <Textarea
          id="ws-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this workspace for?"
          className="min-h-[60px]"
        />
      </div>
      <div className="space-y-2">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-2">
          {WORKSPACE_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors ${
                icon === ic ? 'border-teal bg-teal/10' : 'border-border hover:border-teal/50'
              }`}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Colour</Label>
        <div className="flex flex-wrap gap-2">
          {WORKSPACE_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColour(c)}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                colour === c ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {workspace ? 'Save changes' : 'Create workspace'}
        </Button>
      </DialogFooter>
    </form>
  );
}
