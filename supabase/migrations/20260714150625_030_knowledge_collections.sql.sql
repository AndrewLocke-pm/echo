/*
# Knowledge Collections

## Summary
Creates the `knowledge_collections` table for Notion-style nested
organisational folders within the Knowledge section.

## New Tables
- `knowledge_collections`: hierarchical collections (folders) scoped to
  a user+workspace, supporting arbitrary depth via `parent_collection_id`.

## Columns
- `id` — primary key
- `user_id` — owner, FK to auth.users
- `workspace_id` — scope, composite FK to workspaces(id, user_id)
- `parent_collection_id` — nullable self-reference for nesting; NULL = root
- `name` — display name, 1–200 chars
- `description` — optional description
- `icon` — optional emoji or icon name
- `colour` — optional hex colour string
- `position` — integer for manual ordering within the same parent
- `is_archived` — soft-archive flag; archived collections excluded from default AI/search
- `created_at`, `updated_at` — timestamps

## Constraints
- Parent collection must belong to the same user AND workspace (enforced by trigger).
- A collection cannot be its own parent (CHECK constraint).
- Circular nesting is prevented by a PL/pgSQL trigger that walks ancestors.

## Security
- RLS enabled; four explicit CRUD policies scoped to `authenticated`.
- `validate_collection_parent` trigger function is SECURITY DEFINER, `SET search_path = ''`.
*/

CREATE TABLE IF NOT EXISTS public.knowledge_collections (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL DEFAULT auth.uid()
                                    REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id          uuid        NOT NULL,
  parent_collection_id  uuid        REFERENCES public.knowledge_collections(id) ON DELETE RESTRICT,
  name                  text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description           text,
  icon                  text,
  colour                text,
  position              integer     NOT NULL DEFAULT 0,
  is_archived           boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Collection must not be its own parent
  CONSTRAINT knowledge_collections_no_self_parent CHECK (id IS DISTINCT FROM parent_collection_id),

  -- Composite FK: workspace must be owned by same user
  CONSTRAINT knowledge_collections_workspace_owner_fk
    FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.knowledge_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kc_select_own" ON public.knowledge_collections;
CREATE POLICY "kc_select_own" ON public.knowledge_collections
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "kc_insert_own" ON public.knowledge_collections;
CREATE POLICY "kc_insert_own" ON public.knowledge_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = knowledge_collections.workspace_id
        AND workspaces.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "kc_update_own" ON public.knowledge_collections;
CREATE POLICY "kc_update_own" ON public.knowledge_collections
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = knowledge_collections.workspace_id
        AND workspaces.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "kc_delete_own" ON public.knowledge_collections;
CREATE POLICY "kc_delete_own" ON public.knowledge_collections
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Trigger for updated_at
CREATE TRIGGER knowledge_collections_updated_at
  BEFORE UPDATE ON public.knowledge_collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX knowledge_collections_user_ws_idx
  ON public.knowledge_collections (user_id, workspace_id);
CREATE INDEX knowledge_collections_parent_idx
  ON public.knowledge_collections (parent_collection_id)
  WHERE parent_collection_id IS NOT NULL;
CREATE INDEX knowledge_collections_position_idx
  ON public.knowledge_collections (user_id, workspace_id, parent_collection_id, position);
CREATE INDEX knowledge_collections_archived_idx
  ON public.knowledge_collections (user_id, workspace_id, is_archived);

-- ──────────────────────────────────────────────────────────────────
-- Trigger: prevent circular nesting and cross-user/workspace parents
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_collection_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_ancestor_id uuid;
  v_parent_user_id uuid;
  v_parent_ws_id uuid;
  v_depth integer := 0;
  v_max_depth constant integer := 20;
BEGIN
  IF NEW.parent_collection_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Parent must belong to the same user and workspace
  SELECT user_id, workspace_id
    INTO v_parent_user_id, v_parent_ws_id
    FROM public.knowledge_collections
   WHERE id = NEW.parent_collection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent_collection_id does not exist'
      USING errcode = 'foreign_key_violation';
  END IF;

  IF v_parent_user_id <> NEW.user_id OR v_parent_ws_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'parent_collection_id must belong to the same user and workspace'
      USING errcode = 'foreign_key_violation';
  END IF;

  -- Walk up the ancestor chain; if we reach NEW.id, it is a cycle
  v_ancestor_id := NEW.parent_collection_id;
  WHILE v_ancestor_id IS NOT NULL LOOP
    IF v_ancestor_id = NEW.id THEN
      RAISE EXCEPTION 'circular collection nesting is not allowed'
        USING errcode = 'check_violation';
    END IF;
    v_depth := v_depth + 1;
    IF v_depth > v_max_depth THEN
      RAISE EXCEPTION 'collection nesting depth exceeds maximum (%)', v_max_depth
        USING errcode = 'check_violation';
    END IF;
    SELECT parent_collection_id
      INTO v_ancestor_id
      FROM public.knowledge_collections
     WHERE id = v_ancestor_id;
  END LOOP;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER knowledge_collections_validate_parent
  BEFORE INSERT OR UPDATE OF parent_collection_id, user_id, workspace_id
  ON public.knowledge_collections
  FOR EACH ROW EXECUTE FUNCTION public.validate_collection_parent();

REVOKE EXECUTE ON FUNCTION public.validate_collection_parent() FROM anon;

-- ──────────────────────────────────────────────────────────────────
-- Helper: get full breadcrumb path for a collection as text[]
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.collection_breadcrumb_path(p_collection_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_path    text[] := '{}';
  v_current uuid   := p_collection_id;
  v_name    text;
  v_parent  uuid;
  v_uid     uuid;
  v_depth   integer := 0;
BEGIN
  -- Verify the collection belongs to the calling user
  SELECT user_id INTO v_uid
    FROM public.knowledge_collections
   WHERE id = p_collection_id;

  IF NOT FOUND OR v_uid <> (SELECT auth.uid()) THEN
    RETURN NULL;
  END IF;

  WHILE v_current IS NOT NULL LOOP
    v_depth := v_depth + 1;
    IF v_depth > 20 THEN EXIT; END IF;

    SELECT name, parent_collection_id
      INTO v_name, v_parent
      FROM public.knowledge_collections
     WHERE id = v_current;

    v_path    := array_prepend(v_name, v_path);
    v_current := v_parent;
  END LOOP;

  RETURN v_path;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.collection_breadcrumb_path(uuid) FROM anon;
