# Memory — Journal, Knowledge Base & Personal Memory

A private journal and knowledge-base application with AI-powered memory extraction, semantic search, structured reflections, and grounded conversational recall.

## Features

### Core
- **Authentication**: Email/password sign-up, sign-in, password reset, persistent sessions, protected routes
- **Profiles**: Auto-created on signup, editable display name, theme preference
- **Workspaces**: Create, edit, archive, delete, select, switch, color/icon customization
- **Journal**: Rich-text entries with create, edit, soft-delete, restore from trash, permanent delete
- **Knowledge Notes**: Same CRUD as journal, organized into hierarchical collections
- **Knowledge Collections**: Nested folder tree with document placement, drag-order, archival, and per-collection detail view
- **Projects**: Track active/paused/completed/archived projects with start/target dates, link entries and attachments
- **Full-text Search**: PostgreSQL full-text search across entries with workspace and type filters
- **Attachments**: Image uploads via Supabase Storage, embedded directly in the rich editor
- **App Shell**: Persistent sidebar, workspace selector, knowledge sidebar, New button, theme toggle, sign-out, mobile bottom nav
- **Loading/Empty/Error States**: Throughout the application

### AI-Powered
- **Entry Processing** (`process-entry` Edge Function): Automatically extracts a summary, entities (people, organizations, topics, etc.), suggested memories, and actionable items (decisions, commitments, concerns, questions, tasks, ideas) from journal entries and knowledge notes. Content is chunked and embedded with pgvector for semantic search. Processing is idempotent — unchanged content is skipped.
- **Memory Inbox**: Review AI-suggested memories (approve, reject, archive, supersede). Each memory links back to its source entries with supporting excerpts. User-edited and non-open items are preserved on reprocessing.
- **Ask** (`ask-memory` Edge Function): Conversational Q&A grounded in the user's own data. Uses hybrid retrieval — semantic search over chunk embeddings, full-text search, approved memories, and relevant extracted items — then generates a grounded answer with cited sources. Conversations and messages are persisted for continuity.
- **AI Access Toggle**: Every entry has an `ai_access` flag (`allowed`/`blocked`). AI processing and retrieval respect this flag at the database and function level.

### Rich Text Editor
Built with TipTap: bold, italic, underline, strikethrough, inline code, headings (H1–H3), bullet/ordered/task lists, blockquotes, horizontal rules, links, image uploads, and text alignment. Supports journal and knowledge variants.

## Technology Stack
- **Frontend**: React 18, Vite, TypeScript (strict), Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod, Lucide icons, TipTap, next-themes, Sonner, Recharts, date-fns
- **Backend**: Supabase (PostgreSQL, Auth, RLS, Edge Functions, Storage, pgvector)
- **AI**: OpenAI (embeddings + extraction + chat) via pluggable provider architecture (Anthropic stubbed)

## Environment Variables

See `.env.example`.

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/test only | Test user creation, edge function auth |
| `OPENAI_API_KEY` | Edge Function | OpenAI API access |
| `ANTHROPIC_API_KEY` | Edge Function | Anthropic API (provider stubbed) |
| `AI_PROVIDER` | Edge Function | `openai` (default) or `anthropic` |
| `EMBEDDING_PROVIDER` | Edge Function | Embedding provider |
| `CHAT_MODEL` | Edge Function | Model for Ask responses (default `gpt-4o-mini`) |
| `EXTRACTION_MODEL` | Edge Function | Model for entry extraction (default `gpt-4o-mini`) |
| `REFLECTION_MODEL` | Edge Function | Model for structured reflections (planned) |
| `EMBEDDING_MODEL` | Edge Function | Embedding model (default `text-embedding-3-small`) |
| `APP_URL` | Edge Function | App origin URL |

## Local Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Type Check
```bash
npm run typecheck
```

## Lint
```bash
npm run lint
```

## Tests
```bash
npm run test
```

### Test Suites
- `src/test/tenant-isolation.test.ts` — RLS isolation across two authenticated test users (M1 scope)
- `src/test/m2-tenant-isolation.test.ts` — RLS isolation for projects, processing jobs, memories, extracted items (M2 scope)
- `src/test/knowledge-collections.test.ts` — Knowledge collection tree and document placement
- `src/test/chunking.test.ts` — Text chunking logic used by the process-entry function
- `src/test/value-loop.test.ts` — Value loop / extraction validation
- `src/test/validation.test.ts` — Zod schema validation

> Vitest tests that require `SUPABASE_SERVICE_ROLE_KEY` (via `process.env`, NOT `VITE_`-prefixed) are skipped if the key is not available. The SQL test script at `supabase/tests/tenant-isolation.sql` can be run via the Supabase MCP `execute_sql` tool as an alternative.

## Database Schema

30 migrations applied across foundation, hardening, AI processing, and knowledge organization layers.

### Core Tables
| Table | Purpose |
|---|---|
| `profiles` | User profile, auto-created on signup |
| `workspaces` | User-owned workspaces with icon, color, archive support |
| `content_sources` | Unified journal entries and knowledge notes (renamed from `entries`) |
| `journal_entries` | Journal-specific metadata (mood, weather, location) |
| `knowledge_documents` | Knowledge-specific metadata (document type, review status, collection placement) |
| `knowledge_collections` | Hierarchical collection tree for organizing knowledge documents |
| `projects` | User-owned projects with status tracking and date management |
| `attachments` | File metadata for uploads stored in Supabase Storage |

### AI Tables
| Table | Purpose |
|---|---|
| `processing_jobs` | Tracks entry processing job lifecycle |
| `entry_chunks` | Text chunks with pgvector embeddings for semantic search |
| `entry_ai_summaries` | AI-generated summaries with content hash for idempotency |
| `entities` | Named entities (people, orgs, topics, etc.) extracted from entries |
| `entry_entities` | Links entities to content sources with excerpts and confidence |
| `memories` | Durable memories (suggested, approved, rejected, archived, superseded) |
| `memory_sources` | Links memories back to their originating content sources |
| `extracted_items` | Actionable items (decisions, commitments, tasks, etc.) with status tracking |

### Conversation Tables
| Table | Purpose |
|---|---|
| `conversations` | Ask conversations with optional project linking |
| `messages` | Conversation messages (user/assistant) with source citations |

### Security
- **Row Level Security** enabled on every table (26 tables), with per-verb (SELECT, INSERT, UPDATE, DELETE) policies scoped to `authenticated` users via `auth.uid()` ownership checks
- Journal entries are protected through an ownership chain: `journal_entries` → `content_sources` → `workspaces` → `user_id` — enforced at the database level, not the client
- UPDATE policies include `WITH CHECK` constraints at least as strict as their `USING` predicates, preventing ownership reassignment
- Workspace ownership verified at the database level on INSERT/UPDATE
- Anon execute on triggers revoked
- SECURITY DEFINER functions (`collection_breadcrumb_path`, `semantic_search`, `workspace_entry_count`) include `auth.uid()` ownership checks in the function body and have `search_path` set
- FK indexes added for query performance
- Attachments stored in a private (non-public) Storage bucket with RLS policies tying object access to `attachments.user_id`

### Workspace Deletion Behavior
- **Archive** is the primary action. Archiving does not delete any data.
- **Permanent deletion** is blocked by the database (`ON DELETE RESTRICT`) if the workspace contains any entries.
- The UI shows the exact entry count before attempting deletion.
- If entries exist, the delete button is disabled with an explanation.
- If no entries exist, the user must type the workspace name to confirm.

## Edge Functions

### `process-entry`
Extracts structured information from a content source: summary, entities, suggested memories, and actionable items. Chunks text and generates pgvector embeddings. Idempotent via content hash comparison. Respects the `ai_access` flag. Preserves user-edited and non-open extracted items on reprocessing.

### `ask-memory`
Hybrid retrieval (semantic + full-text + memories + extracted items) feeds a grounded chat response. Conversations and messages are persisted. Strict system prompt prevents fabrication — answers cite only provided context.

### Shared Modules (`_shared/`)
- `ai-provider.ts` — Pluggable AI provider interface (OpenAI implemented, Anthropic stubbed)
- `chunking.ts` — Text chunking and content hashing
- `cors.ts` — CORS headers and preflight handling
- `types.ts` — Shared TypeScript types for extraction
- `validation.ts` — Zod validation schemas for AI output

## Architecture
```
/src
  /components       — App layout, sidebar, knowledge sidebar, mobile nav, rich editor
    /ui             — shadcn/ui primitives
  /hooks            — Auth, workspace, theme, toast, knowledge tree
  /lib
    /supabase       — Supabase client
    /validation     — Zod schemas
  /pages
    /auth           — Sign in, sign up, reset password
                   — Home, journal list/editor/detail, knowledge list/editor/detail,
                     collections, search, projects (list/detail/editor),
                     memory inbox, ask, settings, placeholder
  /types            — TypeScript domain types
/supabase
  /migrations       — 30 SQL migrations
  /functions
    /process-entry  — AI extraction + chunking + embeddings
    /ask-memory     — Hybrid retrieval + grounded chat
    /_shared        — Shared modules (AI provider, chunking, CORS, types, validation)
  /tests            — SQL tenant isolation test script
```

## Privacy
- All data is stored in Supabase PostgreSQL with RLS enforced on every table
- Users can only access their own data — ownership is verified at the database level through an entry → content source → workspace → user chain
- File attachments are stored in a private bucket and served via short-lived signed URLs, not public URLs
- AI keys are never exposed to the browser — all AI calls run in Edge Functions
- Every entry has an AI access toggle (`allowed`/`blocked`) respected by both the database and edge functions
- The Ask function answers only from the user's own context — no external knowledge
- The service role key is server-only and never shipped to the browser

## Roadmap
- **Reflections**: Structured reviews with fixed, conditional, and AI-generated questions (currently placeholder)
- Anthropic provider implementation for AI extraction
- Revoke `EXECUTE` from `anon` on remaining SECURITY DEFINER validation functions (`validate_*`) for defense-in-depth
- Data export
