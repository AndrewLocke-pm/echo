
/* Add FK indexes for conversations and messages */
CREATE INDEX IF NOT EXISTS conversations_workspace_user_fk_idx ON public.conversations (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS conversations_project_ws_user_fk_idx ON public.conversations (project_id, workspace_id, user_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_workspace_user_fk_idx ON public.messages (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS messages_conversation_ws_user_fk_idx ON public.messages (conversation_id, workspace_id, user_id);
