import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { WorkspaceProvider } from '@/hooks/use-workspace';
import { AppLayout } from '@/components/app-layout';
import { SignInPage } from '@/pages/auth/sign-in';
import { SignUpPage } from '@/pages/auth/sign-up';
import { ResetPasswordPage } from '@/pages/auth/reset-password';
import { HomePage } from '@/pages/home';
import { EntryListPage } from '@/pages/entry-list';
import { EntryEditor } from '@/pages/entry-editor';
import { EntryDetailPage } from '@/pages/entry-detail';
import { SearchPage } from '@/pages/search';
import { SettingsPage } from '@/pages/settings';
import { PlaceholderPage } from '@/pages/placeholder';
import { ProjectListPage } from '@/pages/project-list';
import { ProjectEditor } from '@/pages/project-editor';
import { ProjectDetailPage } from '@/pages/project-detail';
import { MemoryInboxPage } from '@/pages/memory-inbox';
import { AskPage } from '@/pages/ask';
import { CollectionPage } from '@/pages/collection-detail';
import { Brain, Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <WorkspaceProvider>
              <AppLayout />
            </WorkspaceProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="journal" element={<EntryListPage sourceType="journal" />} />
        <Route path="journal/new" element={<EntryEditor sourceType="journal" />} />
        <Route path="journal/:id/edit" element={<EntryEditor sourceType="journal" />} />
        <Route path="knowledge" element={<EntryListPage sourceType="knowledge" />} />
        <Route path="knowledge/new" element={<EntryEditor sourceType="knowledge" />} />
        <Route path="knowledge/collections/:id" element={<CollectionPage />} />
        <Route path="knowledge/:id/edit" element={<EntryEditor sourceType="knowledge" />} />
        <Route path="entries/:id" element={<EntryDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route
          path="reflections"
          element={
            <PlaceholderPage
              icon={Brain}
              title="Reflections"
              description="Structured reviews with fixed, conditional, and AI-generated questions"
              milestone="Milestone 5"
            />
          }
        />
        <Route
          path="reflections/new"
          element={
            <PlaceholderPage
              icon={Brain}
              title="New reflection"
              description="Start a structured reflection"
              milestone="Milestone 5"
            />
          }
        />
        <Route path="memory" element={<MemoryInboxPage />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<ProjectEditor />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/edit" element={<ProjectEditor />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
