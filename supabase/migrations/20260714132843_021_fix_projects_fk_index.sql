
/* Fix remaining unindexed FK: projects(workspace_id, user_id) -> workspaces(id, user_id) */
CREATE INDEX IF NOT EXISTS projects_workspace_user_fk_idx ON public.projects (workspace_id, user_id);
