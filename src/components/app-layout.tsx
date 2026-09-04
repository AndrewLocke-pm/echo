import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
