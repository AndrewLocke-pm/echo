
/*
# Protect user-edited extracted items

## Summary
Adds is_user_edited and last_user_edit_at columns to extracted_items.
During reprocessing, user-edited items and non-open items are preserved
rather than being replaced.
*/

ALTER TABLE public.extracted_items
  ADD COLUMN IF NOT EXISTS is_user_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_user_edit_at timestamptz;

CREATE INDEX IF NOT EXISTS extracted_items_is_user_edited_idx
  ON public.extracted_items (is_user_edited)
  WHERE is_user_edited = true;
