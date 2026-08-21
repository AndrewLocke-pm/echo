import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronDown,
  FolderPlus,
  FilePlus,
  MoreHorizontal,
  Trash2,
  Archive,
  Edit3,
  GripVertical,
  Lightbulb,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useKnowledgeTree,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  useMoveDocument,
} from '@/hooks/use-knowledge-tree';
import type { CollectionTreeNode, KnowledgeDocWithSource, KnowledgeCollection } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface KnowledgeSidebarProps {
  workspaceId: string | null;
}

export function KnowledgeSidebar({ workspaceId }: KnowledgeSidebarProps) {
  const { data } = useKnowledgeTree(workspaceId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createDialog, setCreateDialog] = useState<{
    open: boolean;
    parentId: string | null;
  }>({ open: false, parentId: null });
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    collection: CollectionTreeNode | null;
  }>({ open: false, collection: null });
  const [moveDialog, setMoveDialog] = useState<{
    open: boolean;
    doc: KnowledgeDocWithSource | null;
  }>({ open: false, doc: null });
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [newColour, setNewColour] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const createCollection = useCreateCollection();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const moveDocument = useMoveDocument();

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = async () => {
    if (!workspaceId || !newName.trim()) return;
    try {
      await createCollection.mutateAsync({
        workspace_id: workspaceId,
        name: newName.trim(),
        icon: newIcon.trim() || undefined,
        colour: newColour.trim() || undefined,
        parent_collection_id: createDialog.parentId,
      });
      toast({ title: 'Collection created' });
      setCreateDialog({ open: false, parentId: null });
      setNewName('');
      setNewIcon('');
      setNewColour('');
      if (createDialog.parentId) setExpanded((p) => new Set(p).add(createDialog.parentId!));
    } catch (e) {
      toast({ title: 'Failed to create collection', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleRename = async () => {
    if (!renameDialog.collection || !newName.trim()) return;
    try {
      await updateCollection.mutateAsync({
        id: renameDialog.collection.id,
        workspaceId: renameDialog.collection.workspace_id,
        name: newName.trim(),
        icon: newIcon.trim() || undefined,
        colour: newColour.trim() || undefined,
      });
      toast({ title: 'Collection updated' });
      setRenameDialog({ open: false, collection: null });
      setNewName('');
      setNewIcon('');
      setNewColour('');
    } catch (e) {
      toast({ title: 'Failed to update collection', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleArchive = async (col: CollectionTreeNode) => {
    try {
      await updateCollection.mutateAsync({
        id: col.id,
        workspaceId: col.workspace_id,
        is_archived: !col.is_archived,
      });
      toast({ title: col.is_archived ? 'Collection restored' : 'Collection archived' });
    } catch (e) {
      toast({ title: 'Failed to archive collection', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleDelete = async (col: CollectionTreeNode) => {
    if (col.children.length > 0 || col.documents.length > 0) {
      toast({
        title: 'Cannot delete non-empty collection',
        description: 'Move or archive its contents first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await deleteCollection.mutateAsync({ id: col.id, workspaceId: col.workspace_id });
      toast({ title: 'Collection deleted' });
    } catch (e) {
      toast({ title: 'Failed to delete collection', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleMoveDoc = async (collectionId: string | null) => {
    if (!moveDialog.doc || !workspaceId) return;
    try {
      await moveDocument.mutateAsync({
        contentSourceId: moveDialog.doc.content_source_id,
        collectionId,
        parentDocumentId: null,
        position: 0,
        workspaceId,
      });
      toast({ title: 'Document moved' });
      setMoveDialog({ open: false, doc: null });
    } catch (e) {
      toast({ title: 'Failed to move document', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const tree = data?.tree ?? [];
  const rootDocs = data?.rootDocs ?? [];
  const allCollections = data?.collections ?? [];

  return (
    <div className="space-y-1">
      {/* Root actions */}
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Knowledge</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-1.5"
          onClick={() => setCreateDialog({ open: true, parentId: null })}
          title="New collection"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5"
          onClick={() => navigate('/knowledge/new')}
          title="New document"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Root-level documents */}
      {rootDocs.map((doc) => (
        <DocRow
          key={doc.content_source_id}
          doc={doc}
          onMove={(d) => { setMoveDialog({ open: true, doc: d }); }}
        />
      ))}

      {/* Collections tree */}
      {tree.map((node) => (
        <CollectionRow
          key={node.id}
          node={node}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onOpen={() => navigate(`/knowledge/collections/${node.id}`)}
          onCreateChild={(parentId) => setCreateDialog({ open: true, parentId })}
          onRename={(col) => {
            setNewName(col.name);
            setNewIcon(col.icon ?? '');
            setNewColour(col.colour ?? '');
            setRenameDialog({ open: true, collection: col });
          }}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onCreateDoc={(colId) => navigate(`/knowledge/new?collection=${colId}`)}
          onMoveDoc={(d) => setMoveDialog({ open: true, doc: d })}
          allCollections={allCollections}
        />
      ))}

      {tree.length === 0 && rootDocs.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground">No knowledge documents yet</p>
      )}

      {/* Create collection dialog */}
      <Dialog open={createDialog.open} onOpenChange={(o) => setCreateDialog({ open: o, parentId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="Icon (emoji)" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="w-20" />
              <Input placeholder="Colour (hex)" value={newColour} onChange={(e) => setNewColour(e.target.value)} className="w-32" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog({ open: false, parentId: null })}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createCollection.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialog.open} onOpenChange={(o) => setRenameDialog({ open: o, collection: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="Icon (emoji)" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="w-20" />
              <Input placeholder="Colour (hex)" value={newColour} onChange={(e) => setNewColour(e.target.value)} className="w-32" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, collection: null })}>Cancel</Button>
            <Button onClick={handleRename} disabled={!newName.trim() || updateCollection.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move document dialog */}
      <Dialog open={moveDialog.open} onOpenChange={(o) => setMoveDialog({ open: o, doc: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move document</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <button
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => handleMoveDoc(null)}
            >
              Move to root
            </button>
            {allCollections.filter((c) => !c.is_archived).map((c) => (
              <button
                key={c.id}
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => handleMoveDoc(c.id)}
              >
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog({ open: false, doc: null })}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CollectionRow({
  node,
  expanded,
  toggleExpand,
  onOpen,
  onCreateChild,
  onRename,
  onArchive,
  onDelete,
  onCreateDoc,
  onMoveDoc,
  allCollections,
}: {
  node: CollectionTreeNode;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onOpen: () => void;
  onCreateChild: (parentId: string) => void;
  onRename: (col: CollectionTreeNode) => void;
  onArchive: (col: CollectionTreeNode) => void;
  onDelete: (col: CollectionTreeNode) => void;
  onCreateDoc: (collectionId: string) => void;
  onMoveDoc: (doc: KnowledgeDocWithSource) => void;
  allCollections: KnowledgeCollection[];
}) {
  const isExpanded = expanded.has(node.id);
  const isArchived = node.is_archived;
  const navigate = useNavigate();

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-secondary/50"
      >
        <button onClick={() => toggleExpand(node.id)} className="shrink-0 p-0.5">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/40" />
        <button
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {node.icon ? (
            <span className="text-sm">{node.icon}</span>
          ) : (
            <FolderOpen className={cn('h-3.5 w-3.5 shrink-0', isArchived && 'opacity-40')} />
          )}
          <span className={cn('truncate text-sm', isArchived && 'text-muted-foreground line-through')}>
            {node.name}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onCreateChild(node.id)}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" /> New nested collection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateDoc(node.id)}>
              <FilePlus className="mr-2 h-3.5 w-3.5" /> New document
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRename(node)}>
              <Edit3 className="mr-2 h-3.5 w-3.5" /> Rename / edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(node)}>
              <Archive className="mr-2 h-3.5 w-3.5" /> {isArchived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(node)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div className="ml-4 border-l border-border/50 pl-1">
          {node.children.map((child) => (
            <CollectionRow
              key={child.id}
              node={child}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onOpen={() => navigate(`/knowledge/collections/${child.id}`)}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onArchive={onArchive}
              onDelete={onDelete}
              onCreateDoc={onCreateDoc}
              onMoveDoc={onMoveDoc}
              allCollections={allCollections}
            />
          ))}
          {node.documents.map((doc) => (
            <DocRow
              key={doc.content_source_id}
              doc={doc}
              onMove={onMoveDoc}
            />
          ))}
          {node.children.length === 0 && node.documents.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground/60">Empty</p>
          )}
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc,
  onMove,
}: {
  doc: KnowledgeDocWithSource;
  onMove: (doc: KnowledgeDocWithSource) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-secondary/50">
      <div className="w-5 shrink-0" />
      <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/40" />
      <button
        onClick={() => navigate(`/entries/${doc.content_source_id}`)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm">{doc.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onMove(doc)}>
            <Edit3 className="mr-2 h-3.5 w-3.5" /> Move
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
