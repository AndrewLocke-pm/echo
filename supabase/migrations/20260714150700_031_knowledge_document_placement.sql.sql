/*
# Extend knowledge_documents for collection placement

## Summary
Adds collection placement and document nesting to the existing
`knowledge_documents` table without touching any other table.

## Modified Table: knowledge_documents
- `collection_id` (nullable uuid) — places the document inside a collection;
  NULL means root-level (no collection).
- `parent_document_id` (nullable uuid) — optional parent document for
  sub-document nesting; NULL means top-level within its collection/root.
- `position` (integer, default 0) — manual ordering within the same parent.

## Constraints
- `collection_id` FK validates same user+workspace via trigger.
- `parent_document_id` FK validates same user+workspace and prevents self-reference via trigger.
- Circular document nesting prevented by trigger walking ancestor chain.

## Security
- New trigger functions are SECURITY DEFINER, SET search_path = ''.
- anon EXECUTE revoked from all new functions.
*/

-- Add placement columns
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS collection_id        uuid REFERENCES public.knowledge_collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_document_id   uuid REFERENCES public.knowledge_documents(content_source_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position             integer NOT NULL DEFAULT 0;

-- A document cannot be its own parent
ALTER TABLE public.knowledge_documents
  DROP CONSTRAINT IF EXISTS kd_no_self_parent;
ALTER TABLE public.knowledge_documents
  ADD CONSTRAINT kd_no_self_parent
    CHECK (content_source_id IS DISTINCT FROM parent_document_id);

-- Indexes
CREATE INDEX IF NOT EXISTS kd_collection_id_idx
  ON public.knowledge_documents (collection_id)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kd_parent_document_id_idx
  ON public.knowledge_documents (parent_document_id)
  WHERE parent_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kd_position_idx
  ON public.knowledge_documents (collection_id, parent_document_id, position);

-- ──────────────────────────────────────────────────────────────────
-- Trigger: validate collection_id ownership (same user+workspace)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_document_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_coll_user_id  uuid;
  v_coll_ws_id    uuid;
  v_src_user_id   uuid;
  v_src_ws_id     uuid;
BEGIN
  IF NEW.collection_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the document's owner from content_sources
  SELECT user_id, workspace_id
    INTO v_src_user_id, v_src_ws_id
    FROM public.content_sources
   WHERE id = NEW.content_source_id;

  -- Get the collection's owner
  SELECT user_id, workspace_id
    INTO v_coll_user_id, v_coll_ws_id
    FROM public.knowledge_collections
   WHERE id = NEW.collection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'collection_id does not exist'
      USING errcode = 'foreign_key_violation';
  END IF;

  IF v_coll_user_id <> v_src_user_id OR v_coll_ws_id <> v_src_ws_id THEN
    RAISE EXCEPTION 'collection_id must belong to the same user and workspace as the document'
      USING errcode = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER knowledge_documents_validate_collection
  BEFORE INSERT OR UPDATE OF collection_id
  ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_collection();

REVOKE EXECUTE ON FUNCTION public.validate_document_collection() FROM anon;

-- ──────────────────────────────────────────────────────────────────
-- Trigger: validate parent_document_id (same user+workspace, no cycles)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_document_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_parent_user_id uuid;
  v_parent_ws_id   uuid;
  v_src_user_id    uuid;
  v_src_ws_id      uuid;
  v_ancestor_id    uuid;
  v_depth          integer := 0;
  v_max_depth      constant integer := 20;
BEGIN
  IF NEW.parent_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the document's owner from content_sources
  SELECT user_id, workspace_id
    INTO v_src_user_id, v_src_ws_id
    FROM public.content_sources
   WHERE id = NEW.content_source_id;

  -- Get the parent document's owner from content_sources via knowledge_documents
  SELECT cs.user_id, cs.workspace_id
    INTO v_parent_user_id, v_parent_ws_id
    FROM public.knowledge_documents kd
    JOIN public.content_sources cs ON cs.id = kd.content_source_id
   WHERE kd.content_source_id = NEW.parent_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent_document_id does not exist'
      USING errcode = 'foreign_key_violation';
  END IF;

  IF v_parent_user_id <> v_src_user_id OR v_parent_ws_id <> v_src_ws_id THEN
    RAISE EXCEPTION 'parent_document_id must belong to the same user and workspace'
      USING errcode = 'foreign_key_violation';
  END IF;

  -- Walk ancestor chain to detect cycles
  v_ancestor_id := NEW.parent_document_id;
  WHILE v_ancestor_id IS NOT NULL LOOP
    IF v_ancestor_id = NEW.content_source_id THEN
      RAISE EXCEPTION 'circular document nesting is not allowed'
        USING errcode = 'check_violation';
    END IF;
    v_depth := v_depth + 1;
    IF v_depth > v_max_depth THEN
      RAISE EXCEPTION 'document nesting depth exceeds maximum (%)', v_max_depth
        USING errcode = 'check_violation';
    END IF;
    SELECT parent_document_id
      INTO v_ancestor_id
      FROM public.knowledge_documents
     WHERE content_source_id = v_ancestor_id;
  END LOOP;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER knowledge_documents_validate_parent
  BEFORE INSERT OR UPDATE OF parent_document_id
  ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_parent();

REVOKE EXECUTE ON FUNCTION public.validate_document_parent() FROM anon;
