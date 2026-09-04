import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageCircle,
  Send,
  Loader2,
  FileText,
  Brain,
  ListTodo,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate, truncate } from '@/lib/format';
import type { SourceReference } from '@/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
}

const STARTER_QUESTIONS = [
  'What decisions have I made recently?',
  'Which commitments remain unresolved?',
  'What concerns keep recurring?',
  'What did I previously conclude about this?',
  'How has my thinking changed?',
];

export function AskPage() {
  const { currentWorkspace, workspaces } = useWorkspace();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [question, setQuestion] = useState(searchParams.get('q') || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentWorkspace) {
      setSelectedWorkspaceId(currentWorkspace.id);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      supabase
        .from('projects')
        .select('id, name')
        .eq('workspace_id', selectedWorkspaceId)
        .is('deleted_at', null)
        .order('name')
        .then(({ data }) => setProjects(data || []));
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function askQuestion(q?: string) {
    const query = (q || question).trim();
    if (!query || !selectedWorkspaceId || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return;
      }

      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-memory`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            question: query,
            workspace_id: selectedWorkspaceId,
            project_id: selectedProjectId,
            conversation_id: conversationId,
            history,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get answer');
      }

      const data = await response.json();
      setConversationId(data.conversation_id);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Ask failed', description: errorMsg, variant: 'destructive' });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `I encountered an error: ${errorMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!currentWorkspace) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <h1 className="text-2xl font-bold">Ask your life</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Select a workspace to start asking</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-4xl flex-col p-4 md:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Ask your life</h1>
        <p className="text-sm text-muted-foreground">Search across your journal, notes, and memories</p>
      </div>

      {/* Workspace + project selectors */}
      <div className="mb-4 flex gap-2">
        <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.filter((w) => !w.is_archived).map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>{ws.icon} {ws.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedProjectId || 'all'}
          onValueChange={(v) => setSelectedProjectId(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal/10">
              <MessageCircle className="h-8 w-8 text-teal" />
            </div>
            <h3 className="text-lg font-medium">Ask a question</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your answer will be grounded in your journal entries, notes, and memories
            </p>
            <div className="mt-6 space-y-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => askQuestion(q)}
                  className="block w-full rounded-lg border border-border bg-secondary/30 px-4 py-2 text-left text-sm transition-colors hover:border-teal/30 hover:bg-secondary/50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-teal text-white'
                  : 'bg-secondary text-foreground'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border/50 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Sources</p>
                  {msg.sources.map((src, j) => (
                    <div key={j} className="rounded-md border border-border/50 p-2">
                      <div className="flex items-center gap-2">
                        {src.source_type === 'memory' ? (
                          <Brain className="h-3 w-3 text-teal" />
                        ) : src.source_type === 'extracted_item' ? (
                          <ListTodo className="h-3 w-3 text-teal" />
                        ) : (
                          <FileText className="h-3 w-3 text-teal" />
                        )}
                        <span className="text-xs font-medium truncate">{src.source_title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDate(src.source_date)}
                        </span>
                        {src.similarity !== undefined && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {Math.round(src.similarity * 100)}%
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{truncate(src.excerpt, 150)}"
                      </p>
                      <button
                        onClick={() => window.open(`/entries/${src.content_source_id}`, '_self')}
                        className="mt-1 text-xs text-teal hover:underline"
                      >
                        Open source
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t border-border pt-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              askQuestion();
            }
          }}
          placeholder="Ask a question..."
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-teal/50"
          disabled={loading}
        />
        <Button onClick={() => askQuestion()} disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
