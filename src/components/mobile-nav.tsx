import { NavLink, useNavigate } from 'react-router-dom';
import { Home, BookOpen, Plus, Search, Brain, Lightbulb, FolderKanban } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/search', label: 'Search', icon: Search },
];

export function MobileNav() {
  const navigate = useNavigate();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-navy-deep px-2 py-1.5 md:hidden">
      {NAV_ITEMS.slice(0, 2).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs',
              isActive ? 'text-teal' : 'text-muted-foreground'
            )
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}

      {/* Center New button */}
      <div ref={newMenuRef}>
        <DropdownMenu open={newMenuOpen} onOpenChange={setNewMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full bg-teal shadow-glow-teal"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-48">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {NAV_ITEMS.slice(2).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs',
              isActive ? 'text-teal' : 'text-muted-foreground'
            )
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

