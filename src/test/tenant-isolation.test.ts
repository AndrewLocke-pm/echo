/**
 * Tenant Isolation Tests
 *
 * These tests exercise the REAL Supabase RLS policies by creating two
 * authenticated test users and verifying that cross-user access is blocked.
 *
 * The service-role key is loaded via process.env (NOT import.meta.env) so it
 * is never available to browser code or bundled into the frontend.
 *
 * The service-role key is ONLY used to:
 *   - Create User A and User B
 *   - Confirm their email
 *   - Delete the test users after completion
 *
 * All RLS assertions use the anon key with each user's authenticated session.
 *
 * To run:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npm run test
 *
 * Or add SUPABASE_SERVICE_ROLE_KEY to .env (NOT VITE_ prefixed).
 * This variable is test/server-only and must NEVER be exposed to the browser.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser-safe variables: these ARE exposed to the frontend and are safe
// to reference via import.meta.env.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Server/test-only variable: loaded via process.env so it is NEVER bundled
// into the browser. Vite does not expose process.env to client code.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

const canRunTests = !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !!SUPABASE_SERVICE_ROLE_KEY;

const testSuite = canRunTests ? describe : describe.skip;

const RUN_ID = Date.now().toString();
const USER_A_EMAIL = `test-a-${RUN_ID}@tenant-isolation.test`;
const USER_A_PASSWORD = 'TestPassword123!';
const USER_B_EMAIL = `test-b-${RUN_ID}@tenant-isolation.test`;
const USER_B_PASSWORD = 'TestPassword123!';

let adminClient: SupabaseClient;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let userAId: string;
let userBId: string;
let workspaceAId: string;
let workspaceBId: string;
let entryAId: string;

testSuite('Tenant Isolation', () => {
  beforeAll(async () => {
    // Admin client uses the service-role key — ONLY for user management
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create test users via admin API
    const { data: userA, error: errA } = await adminClient.auth.admin.createUser({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
      email_confirm: true,
    });
    if (errA) throw new Error(`Failed to create user A: ${errA.message}`);
    userAId = userA.user.id;

    const { data: userB, error: errB } = await adminClient.auth.admin.createUser({
      email: USER_B_EMAIL,
      password: USER_B_PASSWORD,
      email_confirm: true,
    });
    if (errB) throw new Error(`Failed to create user B: ${errB.message}`);
    userBId = userB.user.id;

    // Sign in as each user with the ANON key — this exercises RLS
    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: signInA } = await clientA.auth.signInWithPassword({
      email: USER_A_EMAIL,
      password: USER_A_PASSWORD,
    });
    if (signInA) throw new Error(`Failed to sign in user A: ${signInA.message}`);

    const { error: signInB } = await clientB.auth.signInWithPassword({
      email: USER_B_EMAIL,
      password: USER_B_PASSWORD,
    });
    if (signInB) throw new Error(`Failed to sign in user B: ${signInB.message}`);

    // Create workspace for User A (using User A's authenticated session)
    const { data: wsA, error: wsErrA } = await clientA
      .from('workspaces')
      .insert({ name: 'User A Workspace', icon: '🏠', colour: '#0d9488' })
      .select()
      .single();
    if (wsErrA) throw new Error(`Failed to create workspace A: ${wsErrA.message}`);
    workspaceAId = wsA.id;

    // Create workspace for User B (using User B's authenticated session)
    const { data: wsB, error: wsErrB } = await clientB
      .from('workspaces')
      .insert({ name: 'User B Workspace', icon: '💼', colour: '#2563eb' })
      .select()
      .single();
    if (wsErrB) throw new Error(`Failed to create workspace B: ${wsErrB.message}`);
    workspaceBId = wsB.id;

    // Create an entry for User A (using User A's authenticated session)
    const { data: entryA, error: entryErr } = await clientA
      .from('content_sources')
      .insert({
        title: 'User A private journal',
        content_text: 'This is a private entry with unique keyword zebra-stripe-tango',
        source_type: 'journal',
        workspace_id: workspaceAId,
        entry_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (entryErr) throw new Error(`Failed to create entry A: ${entryErr.message}`);
    entryAId = entryA.id;
  });

  afterAll(async () => {
    // Clean up test users — cascades to workspaces and entries via FK
    if (userAId) await adminClient.auth.admin.deleteUser(userAId);
    if (userBId) await adminClient.auth.admin.deleteUser(userBId);
  });

  it('1. User A can create and read own workspace', async () => {
    const { data, error } = await clientA
      .from('workspaces')
      .select('*')
      .eq('id', workspaceAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.name).toBe('User A Workspace');
  });

  it("2. User B cannot select User A's workspace", async () => {
    const { data, error } = await clientB
      .from('workspaces')
      .select('*')
      .eq('id', workspaceAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("3. User B cannot select User A's entries", async () => {
    const { data, error } = await clientB
      .from('content_sources')
      .select('*')
      .eq('id', entryAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("4. User B cannot update User A's entries", async () => {
    const { error } = await clientB
      .from('content_sources')
      .update({ title: 'Hacked by B' })
      .eq('id', entryAId);
    // RLS: UPDATE with no matching rows returns no error, 0 affected
    expect(error).toBeNull();

    // Verify the entry was NOT changed (using User A's session)
    const { data: verify } = await clientA
      .from('content_sources')
      .select('title')
      .eq('id', entryAId)
      .single();
    expect(verify?.title).toBe('User A private journal');
  });

  it("5. User B cannot soft-delete or permanently delete User A's entries", async () => {
    // Soft-delete attempt via User B
    const { error: softErr } = await clientB
      .from('content_sources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entryAId);
    expect(softErr).toBeNull();

    // Verify entry is not deleted (via User A)
    const { data: softCheck } = await clientA
      .from('content_sources')
      .select('deleted_at')
      .eq('id', entryAId)
      .single();
    expect(softCheck?.deleted_at).toBeNull();

    // Permanent delete attempt via User B
    const { error: permErr } = await clientB
      .from('content_sources')
      .delete()
      .eq('id', entryAId);
    expect(permErr).toBeNull();

    // Verify entry still exists (via User A)
    const { data: permCheck } = await clientA
      .from('content_sources')
      .select('id')
      .eq('id', entryAId)
      .single();
    expect(permCheck).not.toBeNull();
  });

  it("6. User B cannot restore User A's deleted entries", async () => {
    // User A soft-deletes the entry
    await clientA
      .from('content_sources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entryAId);

    // User B tries to restore it
    const { error } = await clientB
      .from('content_sources')
      .update({ deleted_at: null })
      .eq('id', entryAId);
    expect(error).toBeNull();

    // Verify entry is still deleted (via User A)
    const { data } = await clientA
      .from('content_sources')
      .select('deleted_at')
      .eq('id', entryAId)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect(data?.deleted_at).not.toBeNull();

    // Restore for subsequent tests
    await clientA
      .from('content_sources')
      .update({ deleted_at: null })
      .eq('id', entryAId);
  });

  it("7. User A cannot create an entry referencing User B's workspace", async () => {
    const { data, error } = await clientA
      .from('content_sources')
      .insert({
        title: 'Cross-tenant attempt',
        content_text: 'This should fail',
        source_type: 'journal',
        workspace_id: workspaceBId,
        entry_date: new Date().toISOString().slice(0, 10),
      });
    // RLS INSERT policy checks workspace ownership — must fail
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('8. Unauthenticated client cannot retrieve workspaces or entries', async () => {
    // Fresh client with no sign-in — uses anon key only
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: wsData, error: wsError } = await anonClient
      .from('workspaces')
      .select('*');
    // With no session, auth.uid() is null, RLS blocks all rows
    expect(wsData).toEqual([]);
    if (wsError) {
      expect(wsError.message).toBeTruthy();
    }

    const { data: entryData, error: entryError } = await anonClient
      .from('content_sources')
      .select('*');
    expect(entryData).toEqual([]);
    if (entryError) {
      expect(entryError.message).toBeTruthy();
    }
  });

  it("9. Search results never return another user's entries", async () => {
    // User B searches for the unique keyword in User A's entry
    const { data, error } = await clientB
      .from('content_sources')
      .select('id, title')
      .textSearch('search_vector', 'zebra-stripe-tango');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("10. Trash queries never return another user's deleted entries", async () => {
    // User A soft-deletes the entry
    await clientA
      .from('content_sources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entryAId);

    // User B queries for deleted entries
    const { data, error } = await clientB
      .from('content_sources')
      .select('*')
      .not('deleted_at', 'is', null);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Restore for cleanup
    await clientA
      .from('content_sources')
      .update({ deleted_at: null })
      .eq('id', entryAId);
  });
});

testSuite('Full-Text Search Behavior', () => {
  it('search_vector updates when title or content changes', async () => {
    const uniqueKeyword = 'penguin-dance-party';
    const { error } = await clientA
      .from('content_sources')
      .update({ content_text: `Updated content with ${uniqueKeyword}` })
      .eq('id', entryAId);
    expect(error).toBeNull();

    const { data, error: searchErr } = await clientA
      .from('content_sources')
      .select('id')
      .textSearch('search_vector', uniqueKeyword)
      .maybeSingle();
    expect(searchErr).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(entryAId);
  });

  it('soft-deleted entries are excluded from search results', async () => {
    const keyword = 'rhino-sunset-mango';
    const { data: newEntry } = await clientA
      .from('content_sources')
      .insert({
        title: 'Search exclusion test',
        content_text: keyword,
        workspace_id: workspaceAId,
        entry_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    const { data: beforeDelete } = await clientA
      .from('content_sources')
      .select('id')
      .textSearch('search_vector', keyword)
      .is('deleted_at', null);
    expect(beforeDelete).toHaveLength(1);

    await clientA
      .from('content_sources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', newEntry!.id);

    const { data: afterDelete } = await clientA
      .from('content_sources')
      .select('id')
      .textSearch('search_vector', keyword)
      .is('deleted_at', null);
    expect(afterDelete).toEqual([]);

    await clientA.from('content_sources').delete().eq('id', newEntry!.id);
  });

  it('journal and note filters work correctly', async () => {
    const keyword = 'elephant-garden-tulip';
    const { data: note } = await clientA
      .from('content_sources')
      .insert({
        title: 'Knowledge note for filter test',
        content_text: keyword,
        entry_type: 'note',
        workspace_id: workspaceAId,
        entry_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    const { data: journalResults } = await clientA
      .from('content_sources')
      .select('id, entry_type')
      .textSearch('search_vector', keyword)
      .eq('entry_type', 'journal')
      .is('deleted_at', null);
    expect(journalResults).toEqual([]);

    const { data: noteResults } = await clientA
      .from('content_sources')
      .select('id, entry_type')
      .textSearch('search_vector', keyword)
      .eq('entry_type', 'note')
      .is('deleted_at', null);
    expect(noteResults).toHaveLength(1);

    await clientA.from('content_sources').delete().eq('id', note!.id);
  });

  it('search is restricted by selected workspace', async () => {
    const { data: ws2 } = await clientA
      .from('workspaces')
      .insert({ name: 'Second Workspace A', icon: '🎯', colour: '#db2777' })
      .select()
      .single();

    const keyword = 'workspace-filter-otter';
    await clientA.from('content_sources').insert({
      title: 'Entry in second workspace',
      content_text: keyword,
      workspace_id: ws2!.id,
      entry_date: new Date().toISOString().slice(0, 10),
    });

    const { data: ws1Results } = await clientA
      .from('content_sources')
      .select('id')
      .textSearch('search_vector', keyword)
      .eq('workspace_id', workspaceAId)
      .is('deleted_at', null);
    expect(ws1Results).toEqual([]);

    const { data: ws2Results } = await clientA
      .from('content_sources')
      .select('id')
      .textSearch('search_vector', keyword)
      .eq('workspace_id', ws2!.id)
      .is('deleted_at', null);
    expect(ws2Results).toHaveLength(1);

    await clientA.from('content_sources').delete().textSearch('search_vector', keyword);
    await clientA.from('workspaces').delete().eq('id', ws2!.id);
  });
});

testSuite('Profile & Workspace Defaults', () => {
  it('profile is created exactly once per auth user', async () => {
    const { data, error } = await clientA
      .from('profiles')
      .select('id, display_name')
      .eq('id', userAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(userAId);
  });

  it("default_workspace_id cannot point to another user's workspace", async () => {
    const { error } = await clientA
      .from('profiles')
      .update({ default_workspace_id: workspaceBId })
      .eq('id', userAId);
    // Trigger should block this
    expect(error).not.toBeNull();
  });

  it('default_workspace_id can point to own workspace', async () => {
    const { error } = await clientA
      .from('profiles')
      .update({ default_workspace_id: workspaceAId })
      .eq('id', userAId);
    expect(error).toBeNull();

    const { data } = await clientA
      .from('profiles')
      .select('default_workspace_id')
      .eq('id', userAId)
      .single();
    expect(data?.default_workspace_id).toBe(workspaceAId);
  });
});

testSuite('workspace_entry_count RPC', () => {
  it("User A receives correct count for User A's workspace", async () => {
    const { data, error } = await clientA
      .rpc('workspace_entry_count', { ws_id: workspaceAId });
    expect(error).toBeNull();
    expect(data).toBeGreaterThan(0);
  });

  it("User B cannot retrieve User A's workspace count", async () => {
    const { data, error } = await clientB
      .rpc('workspace_entry_count', { ws_id: workspaceAId });
    // Function should return 0 for a workspace owned by another user
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it('An unauthenticated user cannot call the function successfully', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anonClient
      .rpc('workspace_entry_count', { ws_id: workspaceAId });
    // Function should return 0 or error for unauthenticated callers
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data).toBe(0);
    }
  });

  it('A random or nonexistent workspace ID does not disclose information', async () => {
    const randomId = '00000000-0000-0000-0000-000000000099';
    const { data, error } = await clientA
      .rpc('workspace_entry_count', { ws_id: randomId });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });
});

if (!canRunTests) {
  describe.skip('Tenant Isolation (skipped — no SUPABASE_SERVICE_ROLE_KEY in process.env)', () => {
    it('skipped — set SUPABASE_SERVICE_ROLE_KEY environment variable to run these tests', () => {});
  });
}
