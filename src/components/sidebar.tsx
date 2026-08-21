import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  BookOpen,
  Brain,
  Search,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Moon,
  Sun,
  Lightbulb,
  FolderKanban,
  MessageCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { KnowledgeSidebar } from '@/components/knowledge-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/knowledge', label: 'Knowledge', icon: Lightbulb },
  { to: '/ask', label: 'Ask', icon: MessageCircle },
  { to: '/reflections', label: 'Reflections', icon: Brain },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const { workspaces, currentWorkspace, allWorkspaces, setWorkspaceId, loading: wsLoading } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const isKnowledgeActive = location.pathname.startsWith('/knowledge');
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(isKnowledgeActive);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = (profile?.display_name || user?.email || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-navy-deep transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal text-white font-bold">
          M
        </div>
        {!collapsed && <span className="text-lg font-semibold">Memory</span>}
      </div>

      {/* Workspace selector */}
      {!collapsed && (
        <div className="px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between" disabled={wsLoading}>
                <span className="flex items-center gap-2 truncate">
                  {allWorkspaces ? (
                    <>
                      <span className="text-base">🌐</span>
                      <span className="truncate">All workspaces</span>
                    </>
                  ) : currentWorkspace ? (
                    <>
                      <span className="text-base">{currentWorkspace.icon}</span>
                      <span className="truncate">{currentWorkspace.name}</span>
                    </>
                  ) : wsLoading ? (
                    <span className="text-muted-foreground">Loading...</span>
                  ) : (
                    <span className="text-muted-foreground">No workspace</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              {workspaces.filter((w) => !w.is_archived).map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => setWorkspaceId(ws.id)}
                  className={cn(currentWorkspace?.id === ws.id && 'bg-accent')}
                >
                  <span className="mr-2">{ws.icon}</span>
                  <span className="truncate">{ws.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setWorkspaceId(null)}>
                <span className="mr-2">🌐</span>
                All workspaces
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings?tab=workspaces')}>
                Manage workspaces
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* New button */}
      <div className="px-3 pb-2" ref={newMenuRef}>
        <DropdownMenu open={newMenuOpen} onOpenChange={setNewMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button className="w-full" variant={collapsed ? 'secondary' : 'default'}>
              <Plus className="h-4 w-4" />
              {!collapsed && <span className="ml-1">New</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48">
            <DropdownMenuItem onClick={() => { setNewMenuOpen(false); navigate('/journal/new'); }}>
              <BookOpen className="mr-2 h-4 w-4" />
              Journal entry
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setNewMenuOpen(false); navigate('/knowledge/new'); }}>
              <Lightbulb className="mr-2 h-4 w-4" />
              Knowledge note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setNewMenuOpen(false); navigate('/reflections/new'); }}>
              <Brain className="mr-2 h-4 w-4" />
              Reflection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setNewMenuOpen(false); navigate('/projects/new'); }}>
              <FolderKanban className="mr-2 h-4 w-4" />
              Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => {
          if (item.to === '/knowledge' && !collapsed) {
            return (
              <div key={item.to}>
                <button
                  onClick={() => { navigate('/knowledge'); setKnowledgeExpanded((v) => !v); }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-secondary hover:text-foreground',
                    isKnowledgeActive ? 'bg-teal/15 text-teal' : 'text-muted-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {knowledgeExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                {knowledgeExpanded && (
                  <div className="ml-3 mt-1">
                    <KnowledgeSidebar workspaceId={currentWorkspace?.id ?? null} />
                  </div>
                )}
              </div>
            );
          }
          return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'hover:bg-secondary hover:text-foreground',
                isActive
                  ? 'bg-teal/15 text-teal'
                  : 'text-muted-foreground',
                collapsed && 'justify-center'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <div className="space-y-1">
          <button
            onClick={toggleTheme}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
              collapsed && 'justify-center'
            )}
            title={collapsed ? 'Toggle theme' : undefined}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
          <button
            onClick={onToggleCollapse}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
              collapsed && 'justify-center'
            )}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-secondary',
                collapsed && 'justify-center'
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-teal/20 text-teal text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex min-w-0 flex-col items-start">
                  <span className="truncate text-sm font-medium">
                    {profile?.display_name || 'User'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile?.display_name || 'User'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
