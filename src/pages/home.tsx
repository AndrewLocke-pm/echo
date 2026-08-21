import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronRight,
  FileText,
  Lightbulb,
  MessageCircle,
  Plus,
  Brain,
  FolderKanban,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useWorkspace } from '@/hooks/use-workspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getGreeting, formatDate, formatRelative, truncate } from '@/lib/format';
import type { ContentSource } from '@/types';

export function HomePage() {
  const { user, profile } = useAuth();
  const { currentWorkspace, allWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const [quickCapture, setQuickCapture] = useState('');
  const [capturing, setCapturing] = useState(false);

  const { data: recentEntries, isLoading: entriesLoading } = useQuery({
    queryKey: ['recent-entries', currentWorkspace?.id, allWorkspaces],
    queryFn: async () => {
      let query = supabase
        .from('content_sources')
        .select('*, workspaces(name, icon, colour)')
        .is('deleted_at', null)
        .order('entry_date', { ascending: false })
        .limit(5);
      if (!allWorkspaces && currentWorkspace) {
        query = query.eq('workspace_id', currentWorkspace.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as (ContentSource & { workspaces: { name: string; icon: string; colour: string } | null })[];
    },
    enabled: !!user,
  });

  const { data: entryCount } = useQuery({
    queryKey: ['entry-count', currentWorkspace?.id, allWorkspaces],
    queryFn: async () => {
      let query = supabase
        .from('content_sources')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null);
      if (!allWorkspaces && currentWorkspace) {
        query = query.eq('workspace_id', currentWorkspace.id);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: workspaceCount } = useQuery({
    queryKey: ['workspace-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('workspaces')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  async function handleQuickCapture() {
    if (!quickCapture.trim() || !currentWorkspace) return;
    setCapturing(true);
    const { error } = await supabase.from('content_sources').insert({
      title: quickCapture.slice(0, 80),
      content_text: quickCapture,
      source_type: 'journal',
      workspace_id: currentWorkspace.id,
      entry_date: new Date().toISOString().slice(0, 10),
      processing_status: 'not_requested',
    });
    setCapturing(false);
    if (error) {
      console.error('Quick capture failed:', error.message);
      return;
    }
    setQuickCapture('');
    navigate('/journal');
  }

  const greeting = getGreeting();
  const today = formatDate(new Date(), 'EEEE, MMMM d');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">
          {greeting}, {profile?.display_name || 'there'}
        </h1>
        <p className="text-sm text-muted-foreground">{today}</p>
      </div>

      {/* Quick capture */}
      <Card className="border-teal/20 bg-gradient-navy shadow-card">
        <CardContent className="p-4">
          <textarea
            value={quickCapture}
            onChange={(e) => setQuickCapture(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleQuickCapture();
              }
            }}
            placeholder="What's on your mind? Press Cmd/Ctrl+Enter to capture..."
            className="min-h-[60px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            disabled={!currentWorkspace}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {!currentWorkspace && allWorkspaces
                ? 'Select a workspace to capture'
                : 'Saves as a journal entry'}
            </span>
            <Button
              size="sm"
              onClick={handleQuickCapture}
              disabled={!quickCapture.trim() || capturing || !currentWorkspace}
            >
              {capturing ? 'Saving...' : 'Capture'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Entries"
          value={entryCount ?? 0}
          loading={false}
          to="/journal"
        />
        <StatCard
          icon={FolderKanban}
          label="Workspaces"
          value={workspaceCount ?? 0}
          loading={false}
          to="/settings?tab=workspaces"
        />
        <StatCard
          icon={Brain}
          label="Memories"
          value="—"
          loading={false}
          to="/memory"
        />
        <StatCard
          icon={Sparkles}
          label="Reflections"
          value="—"
          loading={false}
          to="/reflections"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent entries */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold">Recent entries</CardTitle>
            <Link to="/journal" className="flex items-center text-xs text-teal hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {entriesLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : recentEntries && recentEntries.length > 0 ? (
              recentEntries.map((entry) => (
                <Link
                  key={entry.id}
                  to={`/entries/${entry.id}`}
                  className="block rounded-md border border-transparent p-3 transition-colors hover:border-border hover:bg-secondary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {entry.source_type === 'journal' ? (
                          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Lightbulb className="h-3.5 w-3.5 text-amber" />
                        )}
                        <span className="truncate text-sm font-medium">
                          {entry.title || 'Untitled'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {truncate(entry.content_text, 100)}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {entry.workspaces && (
                          <span className="flex items-center gap-1">
                            <span>{entry.workspaces.icon}</span>
                            {entry.workspaces.name}
                          </span>
                        )}
                        <span>·</span>
                        <span>{formatRelative(entry.updated_at)}</span>
                      </div>
                    </div>
                    <ProcessingBadge status={entry.processing_status} />
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No entries yet"
                description="Start journaling to see your recent entries here"
                action={
                  <Button size="sm" onClick={() => navigate('/journal/new')}>
                    <Plus className="mr-1 h-4 w-4" />
                    New entry
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Ask your life */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Ask your life</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Search across your journal, notes, and memories.
              </p>
              <div className="space-y-1.5">
                {[
                  'What decisions have I made recently?',
                  'What concerns keep recurring?',
                  'What did I commit to doing?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => navigate(`/ask?q=${encodeURIComponent(prompt)}`)}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2 text-left text-sm transition-colors hover:border-teal/30 hover:bg-secondary/50"
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0 text-teal" />
                    <span className="truncate">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => navigate('/ask')}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Open Ask
            </Button>
          </CardContent>
        </Card>

        {/* Today's focus */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Today's focus</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={CheckCircle2}
              title="Nothing scheduled"
              description="Commitments and tasks will appear here once extracted"
            />
          </CardContent>
        </Card>

        {/* This week in review */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">This week in review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Entries this week
              </span>
              <span className="font-medium">{recentEntries?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Open commitments
              </span>
              <span className="font-medium">—</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <HelpCircle className="h-4 w-4" />
                Unresolved questions
              </span>
              <span className="font-medium">—</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Active concerns
              </span>
              <span className="font-medium">—</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  to,
}: {
  icon: typeof FileText;
  label: string;
  value: string | number;
  loading: boolean;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card className="transition-colors hover:border-teal/30">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal/10">
            <Icon className="h-5 w-5 text-teal" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-1 h-5 w-12" />
            ) : (
              <p className="text-lg font-semibold">{value}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
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
