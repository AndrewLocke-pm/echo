
/*
# Processing jobs table

## Summary
Creates `processing_jobs` to track AI processing of entries.
Includes composite ownership FKs, RLS, indexes, and a unique constraint
to prevent uncontrolled duplicate active jobs for the same entry.

## Tables
- `processing_jobs`: tracks process_entry jobs

## Constraints
- Composite FK (workspace_id, user_id) → workspaces(id, user_id) ON DELETE RESTRICT
- Composite FK (entry_id, workspace_id, user_id) → entries(id, workspace_id, user_id) ON DELETE CASCADE
- Partial unique index: only one active (pending/processing) job per entry
- job_type CHECK: process_entry
- status CHECK: pending, processing, completed, failed, cancelled
*/

CREATE TABLE public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  job_type text NOT NULL DEFAULT 'process_entry',
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT processing_jobs_job_type_check CHECK (job_type = 'process_entry'),
  CONSTRAINT processing_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT processing_jobs_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT processing_jobs_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT processing_jobs_entry_owner_fk FOREIGN KEY (entry_id, workspace_id, user_id)
    REFERENCES public.entries(id, workspace_id, user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_processing_jobs" ON public.processing_jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_processing_jobs" ON public.processing_jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_processing_jobs" ON public.processing_jobs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_processing_jobs" ON public.processing_jobs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX processing_jobs_user_id_idx ON public.processing_jobs (user_id);
CREATE INDEX processing_jobs_workspace_id_idx ON public.processing_jobs (workspace_id);
CREATE INDEX processing_jobs_entry_id_idx ON public.processing_jobs (entry_id);
CREATE INDEX processing_jobs_status_idx ON public.processing_jobs (status);
CREATE INDEX processing_jobs_pending_idx ON public.processing_jobs (entry_id)
  WHERE status IN ('pending', 'processing');
CREATE INDEX processing_jobs_failed_idx ON public.processing_jobs (entry_id)
  WHERE status = 'failed';

-- Prevent uncontrolled duplicate active jobs: only one pending or processing job per entry
CREATE UNIQUE INDEX processing_jobs_one_active_per_entry_idx
  ON public.processing_jobs (entry_id)
  WHERE status IN ('pending', 'processing');

-- updated_at trigger
CREATE TRIGGER processing_jobs_set_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
