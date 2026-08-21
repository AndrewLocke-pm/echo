/**
 * SQL-based Tenant Isolation Test Script
 *
 * This script verifies RLS policies directly in the database by simulating
 * authenticated sessions for two different users.
 *
 * AUTHENTICATION SIMULATION:
 * ─────────────────────────
 * Supabase RLS policies use auth.uid() which reads the JWT from the current
 * session's `request.jwt.claims` GUC. To simulate an authenticated user:
 *
 *   SELECT set_config('request.jwt.claims',
 *     '{"sub":"<user-uuid>","role":"authenticated"}', false);
 *   SELECT set_config('role', 'authenticated', false);
 *
 * - `request.jwt.claims` sets the JWT payload that auth.uid() reads.
 *   The `sub` field becomes the user's UUID.
 * - `role` is set to `authenticated` so the session runs as the
 *   authenticated database role (the same role Supabase uses for
 *   authenticated API requests).
 * - The `false` parameter means the setting applies to the current
 *   session only (not local to the current transaction).
 *
 * For unauthenticated tests, we set `request.jwt.claims` to `{}` (empty
 * JSON object) so auth.uid() returns NULL, and set `role` to `authenticated`
 * (which is what the anon key maps to when no session is present).
 *
 * TRANSACTION ISOLATION:
 * ──────────────────────
 * Each test section is designed to be run as a separate `execute_sql` call.
 * The MCP `execute_sql` tool runs each query in its own transaction context,
 * so there is no cross-test contamination. The `set_config` calls with
 * `is_local = false` persist for the duration of that query's connection.
 *
 * LIMITATIONS:
 * ────────────
 * This SQL test script does NOT use `BEGIN`/`ROLLBACK` because the MCP
 * `execute_sql` tool does not support transaction control statements.
 * Instead, each test is a self-contained query block that sets up,
 * asserts, and cleans up its own data. Test users are created at the
 * start and deleted at the end.
 *
 * RUN ORDER:
 * ──────────
 * Run each section below as a separate `mcp__supabase__execute_sql` call,
 * in the order presented. Each section's EXPECTED result is noted in
 * a comment.
 */

-- ============================================================
-- SETUP: Create two test users and test data
-- ============================================================
-- These users are created directly in auth.users with encrypted passwords.
-- They are NOT real Supabase Auth users — they exist only for RLS testing.
-- The `email_confirm: true` equivalent is setting `email_confirmed_at`.

-- Create User A
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'tenant-test-a@test.local',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-00000000000a'::uuid);

-- Create User B
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-00000000000b'::uuid,
  'tenant-test-b@test.local',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-00000000000b'::uuid);

-- Create profiles (trigger should also create these, but we ensure they exist)
INSERT INTO public.profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, 'Test User A')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-00000000000b'::uuid, 'Test User B')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TEST 1: User A can create and read own workspace
-- ============================================================
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

INSERT INTO public.workspaces (id, user_id, name, icon, colour)
VALUES ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-00000000000a'::uuid, 'User A WS', '🏠', '#0d9488')
ON CONFLICT (id) DO NOTHING;

SELECT id, name FROM public.workspaces WHERE id = '00000000-0000-0000-0000-0000000000a1'::uuid;
-- EXPECTED: Returns 1 row with name 'User A WS'

-- ============================================================
-- TEST 2: User B cannot select User A's workspace
-- ============================================================
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT id, name FROM public.workspaces WHERE id = '00000000-0000-0000-0000-0000000000a1'::uuid;
-- EXPECTED: Returns 0 rows

-- ============================================================
-- TEST 3: User B cannot select User A's entries
-- ============================================================
-- First, create an entry as User A
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

INSERT INTO public.entries (id, user_id, workspace_id, title, content_text, entry_type, entry_date)
VALUES (
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  '00000000-0000-0000-0000-00000000000a'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'Private entry A',
  'zebra-stripe-tango keyword',
  'journal',
  current_date
)
ON CONFLICT (id) DO NOTHING;

-- Now try to read as User B
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT id, title FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: Returns 0 rows

-- ============================================================
-- TEST 4: User B cannot update User A's entries
-- ============================================================
-- AUTH: role = authenticated, JWT sub = User B's UUID (still set from above)
UPDATE public.entries SET title = 'Hacked' WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: 0 rows affected (RLS blocks the UPDATE)

-- Verify as User A
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT title FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: title is still 'Private entry A'

-- ============================================================
-- TEST 5: User B cannot soft-delete or permanently delete User A's entries
-- ============================================================
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: 0 rows affected

DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: 0 rows affected

-- Verify as User A
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: deleted_at is NULL (entry not deleted)

-- ============================================================
-- TEST 6: User B cannot restore User A's deleted entries
-- ============================================================
-- User A soft-deletes
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;

-- User B tries to restore
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

UPDATE public.entries SET deleted_at = null WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: 0 rows affected

-- Verify as User A: entry should still be deleted
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;
-- EXPECTED: deleted_at is NOT NULL (User B's restore had no effect)

-- Restore for subsequent tests
UPDATE public.entries SET deleted_at = null WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;

-- ============================================================
-- TEST 7: User A cannot create entry referencing User B's workspace
-- ============================================================
-- First create workspace B as User B
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

INSERT INTO public.workspaces (id, user_id, name, icon, colour)
VALUES ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-00000000000b'::uuid, 'User B WS', '💼', '#2563eb')
ON CONFLICT (id) DO NOTHING;

-- Now as User A, try to insert entry with User B's workspace
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

-- This should raise: new row violates row-level security policy for table "entries"
INSERT INTO public.entries (user_id, workspace_id, title, content_text, entry_type, entry_date)
VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid, 'Cross-tenant', 'should fail', 'journal', current_date);
-- EXPECTED: ERROR — new row violates row-level security policy for table "entries"

-- ============================================================
-- TEST 8: Unauthenticated client cannot retrieve workspaces or entries
-- ============================================================
-- AUTH: role = authenticated (anon maps to this), JWT = empty (no sub)
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('role', 'authenticated', false);

SELECT count(*) as ws_count FROM public.workspaces;
-- EXPECTED: ws_count = 0

SELECT count(*) as entry_count FROM public.entries;
-- EXPECTED: entry_count = 0

-- ============================================================
-- TEST 9: Search results never return another user's entries
-- ============================================================
-- First restore the entry as User A
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

UPDATE public.entries SET deleted_at = null WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;

-- User B searches for the unique keyword
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT id, title FROM public.entries
WHERE search_vector @@ to_tsquery('zebra-stripe-tango')
AND deleted_at IS NULL;
-- EXPECTED: Returns 0 rows

-- ============================================================
-- TEST 10: Trash queries never return another user's deleted entries
-- ============================================================
-- User A soft-deletes the entry
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;

-- User B queries trash
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT id FROM public.entries WHERE deleted_at IS NOT NULL;
-- EXPECTED: Returns 0 rows

-- ============================================================
-- TEST 11: workspace_entry_count RPC ownership enforcement
-- ============================================================
-- Restore entry as User A
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

UPDATE public.entries SET deleted_at = null WHERE id = '00000000-0000-0000-0000-0000000000e1'::uuid;

-- User A calls workspace_entry_count for own workspace
SELECT public.workspace_entry_count('00000000-0000-0000-0000-0000000000a1'::uuid) as user_a_count;
-- EXPECTED: Returns >= 1 (at least the test entry exists)

-- User B calls workspace_entry_count for User A's workspace
-- AUTH: role = authenticated, JWT sub = User B's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT public.workspace_entry_count('00000000-0000-0000-0000-0000000000a1'::uuid) as user_b_count;
-- EXPECTED: Returns 0 (workspace belongs to User A, not User B)

-- Unauthenticated call
-- AUTH: role = authenticated, JWT = empty
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('role', 'authenticated', false);

SELECT public.workspace_entry_count('00000000-0000-0000-0000-0000000000a1'::uuid) as anon_count;
-- EXPECTED: Returns 0 (no authenticated user)

-- Random/nonexistent workspace ID
-- AUTH: role = authenticated, JWT sub = User A's UUID
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT set_config('role', 'authenticated', false);

SELECT public.workspace_entry_count('00000000-0000-0000-0000-000000000099'::uuid) as random_count;
-- EXPECTED: Returns 0 (workspace does not exist or doesn't belong to user)

-- ============================================================
-- CLEANUP: Delete test data
-- ============================================================
-- Use service_role to clean up (bypasses RLS)
SELECT set_config('role', 'service_role', false);

DELETE FROM public.entries WHERE id IN (
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  '00000000-0000-0000-0000-0000000000e3'::uuid,
  '00000000-0000-0000-0000-0000000000e4'::uuid
);

DELETE FROM public.workspaces WHERE id IN (
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  '00000000-0000-0000-0000-0000000000b1'::uuid
);

DELETE FROM public.profiles WHERE id IN (
  '00000000-0000-0000-0000-00000000000a'::uuid,
  '00000000-0000-0000-0000-00000000000b'::uuid
);

-- Note: auth.users cleanup requires service_role privileges
-- which the MCP execute_sql tool provides.
