import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Workspace } from '@/types';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  allWorkspaces: boolean;
  loading: boolean;
  setWorkspaceId: (id: string | null) => void;
  setAllWorkspaces: (value: boolean) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const STORAGE_KEY = 'selected-workspace-id';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [allWorkspaces, setAllWorkspacesState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }
    loadWorkspaces();
  }, [user]);

  async function loadWorkspaces() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load workspaces:', error.message);
      setLoading(false);
      return;
    }

    const ws = (data || []) as Workspace[];
    setWorkspaces(ws);

    if (ws.length === 0) {
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }

    const storedId = localStorage.getItem(STORAGE_KEY);
    const defaultWs = ws.find((w) => w.is_default) || ws[0];
    const target =
      ws.find((w) => w.id === storedId) || profile?.default_workspace_id
        ? ws.find((w) => w.id === profile?.default_workspace_id) || defaultWs
        : defaultWs;

    setCurrentWorkspace(target || null);
    setAllWorkspacesState(false);
    setLoading(false);
  }

  function setWorkspaceId(id: string | null) {
    if (id === null) {
      setAllWorkspacesState(true);
      setCurrentWorkspace(null);
      localStorage.setItem(STORAGE_KEY, 'all');
      return;
    }
    const ws = workspaces.find((w) => w.id === id);
    if (ws) {
      setCurrentWorkspace(ws);
      setAllWorkspacesState(false);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }

  function setAllWorkspaces(value: boolean) {
    setAllWorkspacesState(value);
    if (value) {
      setCurrentWorkspace(null);
      localStorage.setItem(STORAGE_KEY, 'all');
    } else {
      const defaultWs = workspaces.find((w) => w.is_default) || workspaces[0];
      if (defaultWs) {
        setCurrentWorkspace(defaultWs);
        localStorage.setItem(STORAGE_KEY, defaultWs.id);
      }
    }
  }

  async function refreshWorkspaces() {
    await loadWorkspaces();
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        allWorkspaces,
        loading,
        setWorkspaceId,
        setAllWorkspaces,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
