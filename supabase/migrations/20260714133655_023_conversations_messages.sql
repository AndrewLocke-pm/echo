
/*
# Conversations and messages tables

## Summary
Creates conversations and messages tables for the Ask your life feature.
Conversations persist in Supabase, not in OpenAI history.

## Tables
- conversations: user conversations within workspaces
- messages: individual messages within conversations

## Constraints
- Composite FK (workspace_id, user_id) -> workspaces(id, user_id) ON DELETE RESTRICT
- project_id -> projects(id) ON DELETE SET NULL
- Composite FK for messages -> conversations
- role CHECK: user, assistant
*/

-- Add unique constraint on projects for composite FK (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_id_workspace_user_unique'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_id_workspace_user_unique
      UNIQUE (id, workspace_id, user_id);
  END IF;
END $$;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  project_id uuid,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT conversations_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT conversations_project_fk FOREIGN KEY (project_id, workspace_id, user_id)
    REFERENCES public.projects(id, workspace_id, user_id) ON DELETE SET NULL
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_conversations" ON public.conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_conversations" ON public.conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_conversations" ON public.conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_conversations" ON public.conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX conversations_user_id_idx ON public.conversations (user_id);
CREATE INDEX conversations_workspace_id_idx ON public.conversations (workspace_id);
CREATE INDEX conversations_project_id_idx ON public.conversations (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX conversations_deleted_at_idx ON public.conversations (deleted_at);

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add unique constraint on conversations for composite FK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_id_workspace_user_unique'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_id_workspace_user_unique
      UNIQUE (id, workspace_id, user_id);
  END IF;
END $$;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  sources_json jsonb,
  model_name text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant')),
  CONSTRAINT messages_workspace_owner_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT messages_conversation_fk FOREIGN KEY (conversation_id, workspace_id, user_id)
    REFERENCES public.conversations(id, workspace_id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_messages" ON public.messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_messages" ON public.messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_messages" ON public.messages FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_messages" ON public.messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX messages_user_id_idx ON public.messages (user_id);
CREATE INDEX messages_workspace_id_idx ON public.messages (workspace_id);
CREATE INDEX messages_conversation_id_idx ON public.messages (conversation_id);
CREATE INDEX messages_created_at_idx ON public.messages (created_at);
