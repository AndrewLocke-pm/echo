-- ============================================================
-- Attachments table and Storage bucket for rich content
-- ============================================================

-- Step 1: Create attachments table
CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  content_source_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  storage_bucket text NOT NULL DEFAULT 'attachments',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK: attachment must belong to a content_source owned by the same user+workspace
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_source_owner_fk
  FOREIGN KEY (content_source_id, workspace_id, user_id)
  REFERENCES public.content_sources(id, workspace_id, user_id) ON DELETE CASCADE;

-- FK: workspace ownership
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_workspace_owner_fk
  FOREIGN KEY (workspace_id, user_id)
  REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT;

-- Constraints
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_file_size_check CHECK (file_size >= 0);

-- Enable RLS
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies (ownership via content_sources)
CREATE POLICY "select_own_attachments" ON public.attachments
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "insert_own_attachments" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.content_sources
      WHERE public.content_sources.id = public.attachments.content_source_id
      AND public.content_sources.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "update_own_attachments" ON public.attachments
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "delete_own_attachments" ON public.attachments
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Indexes
CREATE INDEX attachments_content_source_id_idx ON public.attachments (content_source_id);
CREATE INDEX attachments_user_id_idx ON public.attachments (user_id);
CREATE INDEX attachments_workspace_id_idx ON public.attachments (workspace_id);

-- Trigger for updated_at
CREATE TRIGGER attachments_updated_at
  BEFORE UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Revoke execute from anon
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;

-- Step 2: Create storage bucket (via insert into storage.buckets)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  104857600, -- 100MB limit
  ARRAY[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'text/markdown',
    'application/json', 'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Storage RLS policies
-- Allow authenticated users to manage files in their own folder structure
-- Path pattern: {workspace_id}/{content_source_id}/{filename}

CREATE POLICY "storage_select_own_attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments
      WHERE public.attachments.file_path = storage.objects.name
      AND public.attachments.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "storage_insert_own_attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "storage_update_own_attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments
      WHERE public.attachments.file_path = storage.objects.name
      AND public.attachments.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "storage_delete_own_attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments
      WHERE public.attachments.file_path = storage.objects.name
      AND public.attachments.user_id = (SELECT auth.uid())
    )
  );
