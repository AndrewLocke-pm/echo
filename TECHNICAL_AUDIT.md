# Technical Audit: Security, Testing, and Implementation

**Project:** Journal & Knowledge Base Application
**Date:** 2026-08-17
**Scope:** Database security posture, test suite coverage, edge function architecture, and validation rigour.

---

## 1. Executive Summary

This document describes the security architecture, test coverage, and implementation patterns used to protect user data. The application is a multi-tenant journal and knowledge-base where each user's data is isolated at the database level by PostgreSQL Row Level Security (RLS) policies.

**Key findings:**

- All 26 tables have RLS enabled with per-verb (SELECT, INSERT, UPDATE, DELETE) ownership policies.
- The test suite contains 6 test files with 51 individual test cases covering tenant isolation, data integrity, AI processing safety, validation, and chunking logic.
- Both Edge Functions authenticate the user's JWT before performing any work and verify ownership before returning data.
- AI output is validated with Zod schemas before any database write.
- User-edited data survives AI reprocessing — the `is_user_edited` flag and status filters prevent user changes from being overwritten.
- One advisory item remains: six `SECURITY DEFINER` functions are callable by the `anon` role. These functions include internal ownership checks and do not leak data, but revoking `EXECUTE` from `anon` would close an unnecessary entry point.

---

## 2. Database Security Architecture

### 2.1 Row Level Security (RLS)

Every table in the `public` schema has RLS enabled. Supabase's PostgREST API enforces these policies automatically — no client query can bypass them. Each table has four policies (one per CRUD verb) scoped to the `authenticated` role.

**Ownership chain for journal entries:**

```
auth.users
  └── workspaces (user_id = auth.uid())
        └── content_sources (workspace_id → workspaces.id, user_id = auth.uid())
              ├── attachments (content_source_id → content_sources.id, user_id = auth.uid())
              ├── entry_chunks (content_source_id → content_sources.id)
              ├── entry_ai_summaries (content_source_id → content_sources.id)
              ├── entry_entities (content_source_id → content_sources.id)
              ├── extracted_items (content_source_id → content_sources.id)
              └── memory_sources (content_source_id → content_sources.id)
```

Every RLS policy checks `auth.uid() = user_id` on the table's own `user_id` column. For INSERT and UPDATE on child tables (e.g., `content_sources`), the policy additionally verifies workspace ownership via a subquery:

```sql
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM workspaces
    WHERE workspaces.id = content_sources.workspace_id
      AND workspaces.user_id = auth.uid()
  )
)
```

This prevents a user from creating or moving an entry into another user's workspace, even if they somehow know the workspace UUID.

### 2.2 UPDATE Policy Rigour

All UPDATE policies include a `WITH CHECK` constraint at least as strict as the `USING` predicate. This means:

- A user cannot reassign an entry's `user_id` to another user (the `WITH CHECK` requires `auth.uid() = user_id` on the new row).
- A user cannot move an entry to another user's workspace (the `WITH CHECK` re-verifies workspace ownership on the updated row).

Without the `WITH CHECK`, a user could UPDATE a row they own (passing the `USING` check) and then change its `user_id` or `workspace_id` to another user's, effectively transferring data out of their control.

### 2.3 Composite Foreign Keys

The `workspaces` table has a composite unique constraint on `(id, user_id)`. The `content_sources` table has a composite foreign key `(workspace_id, user_id) → workspaces(id, user_id)`. This is a second line of defence: even if RLS were disabled, the database would reject an entry referencing a workspace that belongs to a different user.

### 2.4 SECURITY DEFINER Functions

Six database functions use `SECURITY DEFINER` (they run with the table owner's privileges, bypassing RLS):

| Function | Purpose | Internal ownership check |
|----------|---------|--------------------------|
| `handle_new_user` | Auto-create profile on signup | Trigger-only; not callable via API |
| `workspace_entry_count` | Count entries in a workspace | Verifies `auth.uid() = workspaces.user_id` |
| `collection_breadcrumb_path` | Build breadcrumb path for a collection | Verifies `auth.uid() = collection.user_id` |
| `semantic_search` | Vector similarity search | Verifies `auth.uid() = workspaces.user_id` |
| `validate_knowledge_collection_parent` | Prevent cross-user/cross-workspace parent | Trigger-only |
| `validate_knowledge_document_placement` | Prevent cross-user/cross-workspace document placement | Trigger-only |

All functions include `auth.uid()` ownership checks in the function body. The trigger functions (`handle_new_user`, `validate_*`) have had `EXECUTE` revoked from `anon`. The three query functions (`workspace_entry_count`, `collection_breadcrumb_path`, `semantic_search`) are still executable by `anon` — this is the advisory item noted above. They return empty results or zero for unauthenticated callers because `auth.uid()` returns NULL and no workspace matches, but revoking `EXECUTE` would be defence-in-depth.

### 2.5 Storage Security

File attachments are stored in a private (non-public) Supabase Storage bucket. Access is controlled by RLS policies on the `storage.objects` table that tie object access to the `attachments.user_id` column. Files are served via short-lived signed URLs, not public URLs.

### 2.6 Full-Text Search

The `content_sources` table has a generated `tsvector` column (`search_vector`) built from `title` and `content_text`. RLS applies to FTS queries identically to regular SELECTs — a user searching for a keyword that appears in another user's entry will get zero results. Soft-deleted entries (`deleted_at IS NOT NULL`) are excluded from search results by application-level query filters.

---

## 3. Test Suite

### 3.1 Test Infrastructure

- **Framework:** Vitest (node environment, 30s timeout per test)
- **Test runner:** `npm run test` (runs `vitest run`)
- **Location:** `src/test/*.test.ts`
- **Database tests:** Use real Supabase instances with two authenticated test users. The service-role key is loaded via `process.env` (not `import.meta.env`) so it is never bundled into browser code.
- **Graceful skip:** Tests auto-skip when `SUPABASE_SERVICE_ROLE_KEY` is not in `process.env`, so `npm run build` and local UI development are not blocked.
- **Cleanup:** Every test creates users with unique timestamps in the email and deletes them in `afterAll`, cascading to all associated data via FK `ON DELETE CASCADE`.

### 3.2 Test Files

#### `tenant-isolation.test.ts` — 14 tests

Core tenant isolation for Milestone 1 tables (workspaces, entries, profiles).

| Test | What it verifies |
|------|-----------------|
| 1 | User A can create and read own workspace |
| 2 | User B cannot SELECT User A's workspace |
| 3 | User B cannot SELECT User A's entries |
| 4 | User B cannot UPDATE User A's entries (title remains unchanged) |
| 5 | User B cannot soft-delete or hard-delete User A's entries |
| 6 | User B cannot restore User A's soft-deleted entries |
| 7 | User A cannot INSERT an entry referencing User B's workspace |
| 8 | Unauthenticated client gets empty results for all tables |
| 9 | Full-text search never returns another user's entries |
| 10 | Trash queries never return another user's deleted entries |
| 11 | `search_vector` updates when title or content changes |
| 12 | Soft-deleted entries are excluded from search results |
| 13 | Journal/note entry_type filters work correctly |
| 14 | Search is restricted by selected workspace |

Plus 3 profile/workspace RPC tests:
- Profile is created exactly once per auth user
- `default_workspace_id` cannot point to another user's workspace (trigger blocks)
- `workspace_entry_count` RPC returns 0 for wrong user and for unauthenticated caller

#### `m2-tenant-isolation.test.ts` — 17 tests

Extends isolation testing to all Milestone 2 tables: `projects`, `processing_jobs`, `entry_chunks`, `entry_ai_summaries`, `entities`, `entry_entities`, `memories`, `memory_sources`, `extracted_items`.

| Tests | What they verify |
|-------|-----------------|
| 1–4 | Project isolation: cross-user read blocked, cross-project entry creation blocked, cross-workspace project creation blocked, soft-deleted projects excluded |
| 5–12 | Cross-user read blocked for processing_jobs, entry_chunks, entry_ai_summaries, entities, entry_entities, memories, memory_sources, extracted_items |
| 13 | Duplicate active processing jobs are prevented (unique constraint) |
| 14 | Entity deduplication prevents duplicates (unique constraint on `user_id, workspace_id, entity_type, normalised_name`) |
| 15 | Entry-entity link deduplication prevents duplicates |
| 16 | Memory deduplication prevents exact duplicates (unique constraint on `normalised_text`) |
| 17 | Memory-source link deduplication prevents duplicates |

#### `value-loop.test.ts` — 11 tests

Tests the core "value loop" — the cycle of writing an entry, AI processing it, and asking questions about it.

| Test | What it verifies |
|------|-----------------|
| 1 | User-edited extracted items survive reprocessing (`is_user_edited` flag + status filter prevents deletion) |
| 2 | Non-open items (completed, resolved) are preserved during reprocessing |
| 3 | Approved memories remain preserved when new suggestions are added |
| 4 | Rejected memories are excluded from retrieval context |
| 5 | Cross-user vector retrieval is impossible (User B cannot read User A's entry_chunks) |
| 6 | Wrong-workspace retrieval returns nothing |
| 7 | `semantic_search` RPC returns empty for a workspace owned by another user |
| 8 | AI-blocked entries (`ai_access = 'blocked'`) do not appear in semantic search |
| 9 | Soft-deleted entries do not appear in semantic search |
| 10 | Conversations and messages are user-isolated |
| 11 | Embedding dimension validation — vector column accepts 1536-dim vectors |

#### `knowledge-collections.test.ts` — 12 tests

Tests the knowledge organization layer: collections, documents, and their parent-child relationships.

| Test | What it verifies |
|------|-----------------|
| 1 | User A cannot access User B's collections |
| 2 | A collection cannot use another user's collection as its parent |
| 3 | A collection cannot use a parent from another workspace |
| 4 | Circular collection nesting is prevented (trigger detects cycles) |
| 5 | A document cannot be assigned to another user's collection |
| 6 | A document cannot be assigned to a collection in another workspace |
| 7 | Circular document nesting is prevented |
| 8 | Moving a document does not change its source ID |
| 9 | Moving a document does not break chunks, embeddings, or citations |
| 10 | Archived collections are excluded from default search and AI retrieval |
| 11 | A non-empty collection cannot be permanently deleted (FK RESTRICT) |
| 12 | Root-level documents (no collection) remain supported |

#### `validation.test.ts` — 13 tests

Tests the Zod extraction schema used to validate AI provider output before database insertion. No database connection required.

| Test | What it verifies |
|------|-----------------|
| 1 | Valid extraction JSON passes validation |
| 2 | Missing summary fails |
| 3 | Unknown entity type fails |
| 4 | Confidence above 1.0 fails |
| 5 | Confidence below 0.0 fails |
| 6 | Invalid `due_date` type (non-string, non-null) fails |
| 7 | Unsupported item type fails |
| 8 | Unknown memory type fails |
| 9 | Empty arrays are valid (nothing to extract is OK) |
| 10 | Null `due_date` is valid |
| 11 | String `due_date` is valid |
| 12 | Missing top-level fields fail |
| 13 | Excessively long summary fails (2001 chars > max 2000) |

#### `chunking.test.ts` — 8 tests

Tests the text chunking utility used by the `process-entry` Edge Function. No database connection required.

| Test | What it verifies |
|------|-----------------|
| 1 | Short entries produce one chunk |
| 2 | Long entries produce multiple chunks |
| 3 | Paragraphs remain ordered |
| 4 | Blank entries produce no chunks |
| 5 | Chunk indices are sequential starting from 0 |
| 6 | Token count is positive for non-empty chunks |
| 7 | Paragraph boundaries are preserved where possible |
| 8 | Multiple paragraphs exceeding max chunk size split into separate chunks |

### 3.3 SQL Test Script

`supabase/tests/tenant-isolation.sql` is a standalone SQL script that verifies RLS policies directly in the database by simulating authenticated sessions via `set_config('request.jwt.claims', ...)`. It covers the same 10 core isolation scenarios as the Vitest suite but at the raw SQL level, independent of the JS client library. This serves as a cross-check: if a bug were introduced in the JS client or Supabase SDK, the SQL test would still catch RLS regressions.

---

## 4. Edge Function Architecture

### 4.1 `process-entry` — AI Extraction Pipeline

**Location:** `supabase/functions/process-entry/index.ts`

**Flow:**

1. **CORS preflight** — Returns 200 with CORS headers for OPTIONS requests.
2. **Authentication** — Extracts the `Authorization` header, calls `auth.getUser()` to verify the JWT, and extracts `userId`. Returns 401 if no valid session.
3. **Input validation** — Requires `content_source_id` as a string. Returns 400 if missing.
4. **Ownership verification** — Fetches the content source via the service-role client and checks `source.user_id === userId`. Returns 404 if not found or not owned by the caller.
5. **AI access check** — If `ai_access !== 'allowed'`, sets `processing_status = 'blocked'` and returns 403. No AI call is made.
6. **Deleted check** — If `deleted_at` is set, returns 400. No processing occurs on deleted entries.
7. **Job management** — Creates or reclaims a `processing_jobs` row. If a job is already `processing`, it is cancelled and a new one created with an incremented `attempt_count`.
8. **Idempotency** — Computes a SHA-256 hash of the full content (`title + content_text`). If an `entry_ai_summaries` row already exists with the same `source_content_hash`, the function returns early with "already processed" — no duplicate AI call or database write.
9. **Project context** — If the entry is linked to a project, fetches the project name and description for the AI prompt.
10. **AI extraction** — Calls the configured provider (OpenAI by default) with a system prompt that enforces extraction rules (no fabricated dates, no sensitive attribute inference, empty arrays when nothing qualifies).
11. **Schema validation** — The AI response is parsed and validated with `extractionSchema.parse()`. If the output does not match the Zod schema, the function throws and the error is caught and recorded.
12. **Chunking + embeddings** — The full content is split into chunks (max 2000 chars, 200 char overlap). Each chunk is embedded via OpenAI's embedding API. Existing chunks are deleted before inserting new ones.
13. **Entity upsert** — Entities are upserted on `(user_id, workspace_id, entity_type, normalised_name)`. Entry-entity links are upserted on `(content_source_id, entity_id)`.
14. **Extracted items** — Before inserting new items, deletes only `status = 'open' AND is_user_edited = false`. This preserves user-edited items and items the user has already resolved or completed.
15. **Memory deduplication** — Memories are deduplicated on `normalised_text` (lowercased, whitespace-collapsed). If a memory with the same normalised text exists, a new `memory_sources` link is added rather than creating a duplicate.
16. **Status updates** — On success: `processing_status = 'completed'`, job `status = 'completed'`. On failure: `processing_status = 'failed'` with a truncated error message (max 500 chars), job `status = 'failed'`.

**Key safety properties:**

- The AI API key is read from `Deno.env.get()` — it is never sent to the browser.
- The service-role key is used for database writes but only after the user's JWT has been verified and ownership confirmed.
- Error messages are truncated to 500 characters before being stored or returned, preventing large error payloads from the AI provider from leaking.
- The `processing_status` state machine (`not_requested → pending → processing → completed | failed | blocked`) prevents concurrent processing of the same entry.

### 4.2 `ask-memory` — Retrieval-Augmented Chat

**Location:** `supabase/functions/ask-memory/index.ts`

**Flow:**

1. **CORS + authentication** — Same pattern as `process-entry`.
2. **Input validation** — Requires `question` (non-empty string) and `workspace_id` (UUID string). Returns 400 if missing.
3. **Workspace ownership** — Fetches the workspace and verifies `workspaces.user_id === userId`. Returns 404 if not found. This prevents a user from querying another user's workspace.
4. **Hybrid retrieval:**
   - **Semantic search** — Calls the `semantic_search` RPC with the question embedding and `p_workspace_id`. The RPC function internally verifies workspace ownership, so even if the function were called with another user's workspace ID, it would return empty.
   - **Full-text search** — Queries `content_sources` with `textSearch('search_vector', question)`, filtered by `workspace_id`, `deleted_at IS NULL`, and `ai_access = 'allowed'`.
   - **Approved memories** — Queries `memories` where `status = 'approved'` and `ai_access = 'allowed'`. Rejected memories are excluded.
   - **Extracted items** — Queries `extracted_items` where `status IN ('open', 'resolved')`.
5. **Context building** — Combines up to 8 sources into a context block for the LLM. Semantic and FTS results are deduplicated by `content_source_id`.
6. **LLM call** — Sends the context and conversation history (last 6 messages) to OpenAI with a system prompt that enforces: answer only from provided context, acknowledge conflicts, do not use rejected memories, and say "I don't have enough information" when context is insufficient.
7. **Conversation persistence** — Creates or updates a `conversations` row and inserts both the user's question and the assistant's answer (with `sources_json`) as `messages` rows.

**Key safety properties:**

- All retrieval queries are scoped to the user's `workspace_id`.
- The system prompt instructs the LLM to answer only from provided context — it does not inject external knowledge.
- Rejected and AI-blocked memories/entries are excluded from the context.
- Conversation history is capped at 6 messages to limit prompt size.

### 4.3 Shared Modules

| Module | Purpose |
|--------|---------|
| `_shared/cors.ts` | CORS headers + preflight handler. Every response includes `Access-Control-Allow-Origin: *` and the required headers for Supabase client compatibility. |
| `_shared/ai-provider.ts` | Provider abstraction (`AIProvider` interface). Currently implements `OpenAIProvider`. The system prompt enforces extraction rules. `getProvider()` reads `AI_PROVIDER` env var and throws for unsupported providers. |
| `_shared/chunking.ts` | Text chunking with 2000-char max chunks and 200-char overlap. `contentHashAsync()` uses SHA-256 via `crypto.subtle` for idempotency checks. |
| `_shared/validation.ts` | Zod schema for AI extraction output. Validates entity types, memory types, item types, confidence ranges (0–1), string length limits, and array size limits. |
| `_shared/types.ts` | Shared TypeScript interfaces for extraction input/output. |

---

## 5. Client-Side Validation

### 5.1 Form Schemas

`src/lib/validation/schemas.ts` defines Zod schemas for all user-facing forms:

- **`signInSchema` / `signUpSchema`** — Email validation + 6-char minimum password. Display name max 100 chars.
- **`workspaceSchema`** — Name required, max 100 chars. Description max 500 chars.
- **`contentSourceSchema`** — Title required, max 300 chars. Content max 100,000 chars. `ai_access` enum (`allowed`/`blocked`). `workspace_id` must be a UUID. `project_id` optional UUID.
- **`projectSchema`** — Name required, max 200 chars. Description max 2000 chars. Status enum (`active`/`paused`/`completed`/`archived`).
- **`collectionSchema`** — Name required, max 200 chars. Description max 1000 chars. Parent collection optional UUID.
- **`knowledgeDocumentSchema`** — Document type enum, status enum, `allow_memory_extraction` boolean.

These schemas are used with `react-hook-form`'s `zodResolver`, providing client-side validation before any API call. They serve as a first line of defence against malformed input, with database-level constraints (CHECK constraints, foreign keys) as the second line.

### 5.2 Supabase Client

`src/lib/supabase/client.ts` creates the browser Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — both public, non-secret values. The service-role key is never referenced in any client-side code. It is only loaded via `process.env` in test files and `Deno.env.get()` in Edge Functions.

---

## 6. Data Integrity Patterns

### 6.1 User-Edited Item Preservation

The `extracted_items` table has an `is_user_edited` boolean and a `last_user_edit_at` timestamp. When the AI reprocesses an entry, the `process-entry` function deletes only items matching:

```sql
DELETE FROM extracted_items
WHERE content_source_id = ?
  AND status = 'open'
  AND is_user_edited = false
  AND deleted_at IS NULL
```

This means:
- Items the user has edited (`is_user_edited = true`) are never deleted by reprocessing.
- Items the user has resolved or completed (`status != 'open'`) are never deleted.
- Only AI-generated, still-open items are replaced with fresh extractions.

This is tested in `value-loop.test.ts` tests 1 and 2.

### 6.2 Memory Deduplication

Memories are deduplicated on `(user_id, workspace_id, normalised_text)` where `normalised_text` is the memory text lowercased, trimmed, and whitespace-collapsed. When the AI extracts a memory that already exists:
- No duplicate memory row is created.
- A new `memory_sources` link is added connecting the existing memory to the current entry.

This prevents memory proliferation across reprocessing runs.

### 6.3 Idempotent Processing

The `process-entry` function computes a SHA-256 hash of the entry content before calling the AI. If an `entry_ai_summaries` row exists with the same `source_content_hash`, the function returns early. This means:
- Re-submitting the same entry for processing does not consume AI API calls.
- Editing the entry (which changes the hash) triggers a fresh processing run.

### 6.4 Soft Delete

All user-facing tables have a `deleted_at` timestamp column. Deletion is a soft-delete operation (`UPDATE ... SET deleted_at = now()`). This allows:
- Trash/restore functionality.
- Search queries to filter `WHERE deleted_at IS NULL`.
- Semantic search to exclude deleted entries.
- FK relationships to remain intact for audit purposes.

Permanent deletion uses `DELETE FROM ...` which is governed by RLS and FK constraints.

### 6.5 Circular Reference Prevention

Knowledge collections and documents support hierarchical nesting (parent-child relationships). Database triggers (`validate_knowledge_collection_parent`, `validate_knowledge_document_placement`) prevent:
- Cross-user parent references (a user's collection cannot have another user's collection as parent).
- Cross-workspace parent references.
- Circular nesting (A → B → C → A).

These are tested in `knowledge-collections.test.ts` tests 4 and 7.

---

## 7. Migration Architecture

30 SQL migrations in `supabase/migrations/`, applied sequentially. Each migration is idempotent (uses `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, and `DO $$ ... END $$` guards for constraints).

| Milestone | Migrations | Focus |
|-----------|-----------|-------|
| M1 Foundation | 001–007 | Tables, RLS, triggers, indexes, profile auto-creation |
| M1 Projects | 008–009 | Projects table, entry-project linking |
| M1 AI Pipeline | 011–019 | Processing jobs, chunks, summaries, entities, memories, extracted items |
| M1 Hardening | 020–022 | FK indexes, user-edited item protection |
| M1 Conversations | 023–025 | Conversations, messages, pgvector enablement |
| M2 Domain Refactor | 026–031 | Content sources domain separation, attachments/storage, knowledge collections |

Key migration patterns:
- **Composite FKs** (`workspaces_id_user_id_unique`) for cross-table ownership enforcement.
- **Generated columns** (`search_vector`) for full-text search without trigger overhead.
- **Partial indexes** (`WHERE deleted_at IS NULL`) for query performance on active rows.
- **GIN indexes** on `search_vector` and `embedding` for FTS and vector search.
- **SECURITY DEFINER** functions with `SET search_path = public` to prevent search path manipulation.

---

## 8. Advisory Items

### 8.1 Anon EXECUTE on SECURITY DEFINER Functions (WARN)

**Finding:** Three functions (`collection_breadcrumb_path`, `semantic_search`, `workspace_entry_count`) are callable by the `anon` role without signing in.

**Risk:** Low. Each function includes `auth.uid()` ownership checks and returns empty results for unauthenticated callers. No data is leaked.

**Remediation:** Revoke `EXECUTE` from `anon` on these functions:
```sql
REVOKE EXECUTE ON FUNCTION collection_breadcrumb_path(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION semantic_search(vector, uuid, int, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION workspace_entry_count(uuid) FROM anon;
```

This is a defence-in-depth measure, not a fix for an active vulnerability.

### 8.2 Vector Extension in Public Schema (WARN)

**Finding:** The `vector` extension is installed in the `public` schema. Supabase recommends moving it to a dedicated schema (e.g., `extensions`).

**Risk:** Minimal. This is a Supabase platform convention, not a security vulnerability.

### 8.3 Knowledge Collections Test Uses Service-Role Key

**Finding:** `knowledge-collections.test.ts` uses the service-role key for all operations (including the "isolation" assertions) rather than authenticated user sessions like the other test files.

**Risk:** The tests verify that the service-role client, when filtering by `user_id`, does not return other users' data. This tests the data model but does not exercise RLS policies for these tables. The other test files (`tenant-isolation`, `m2-tenant-isolation`, `value-loop`) do exercise RLS properly with authenticated sessions.

**Remediation:** Refactor `knowledge-collections.test.ts` to use authenticated user sessions (anon key + sign-in) consistent with the other test files.

---

## 9. Dependency Inventory

### Runtime
- **React 18** + React Router for SPA navigation
- **TipTap** for rich text editing (journal entries)
- **@supabase/supabase-js** for database/auth/storage client
- **@tanstack/react-query** for server state management
- **zod** for schema validation
- **react-hook-form** for form state
- **Tailwind CSS** + shadcn/ui (Radix primitives) for UI
- **lucide-react** for icons
- **date-fns** for date formatting
- **recharts** for charts
- **sonner** + Radix toast for notifications

### Development
- **Vite** for build/dev server
- **TypeScript** (strict mode) for type safety
- **Vitest** for testing
- **ESLint** with React hooks and refresh plugins

### Edge Functions (Deno)
- **jsr:@supabase/supabase-js@2** for database access
- **npm:zod** for extraction schema validation

No AI keys, service-role keys, or secrets are included in the client bundle. All secrets are server-side only.
