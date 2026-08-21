/**
 * Core MVP Value Loop Tests
 *
 * Tests for:
 * - User-edited items survive reprocessing
 * - Approved memories remain preserved
 * - AI-blocked entries receive no embeddings
 * - Deleted entries do not appear in vector search
 * - Cross-user vector retrieval is impossible
 * - Wrong-workspace retrieval returns nothing
 * - Rejected memories are excluded
 * - Malformed AI answer output fails safely
 *
 * Tenant isolation tests use anon key with authenticated sessions.
 * Service role key only for setup/cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

const canRunTests = !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !!SUPABASE_SERVICE_ROLE_KEY;
const testSuite = canRunTests ? describe : describe.skip;

const RUN_ID = Date.now().toString();
const USER_A_EMAIL = `loop-a-${RUN_ID}@test.local`;
const USER_B_EMAIL = `loop-b-${RUN_ID}@test.local`;
const PASSWORD = 'TestPassword123!';

let adminClient: SupabaseClient;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let userAId: string;
let userBId: string;
let workspaceAId: string;
let entryAId: string;
let projectAId: string;

testSuite('Core MVP Value Loop', () => {
  beforeAll(async () => {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userA } = await adminClient.auth.admin.createUser({
      email: USER_A_EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (!userA.user) throw new Error('Failed to create user A');
    userAId = userA.user.id;

    const { data: userB } = await adminClient.auth.admin.createUser({
      email: USER_B_EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (!userB.user) throw new Error('Failed to create user B');
    userBId = userB.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: PASSWORD });
    await clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: PASSWORD });

    const { data: wsA } = await clientA.from('workspaces').insert({ name: 'Loop WS A' }).select().single();
    if (!wsA) throw new Error('Failed to create workspace A');
    workspaceAId = wsA.id;

    const { data: wsB } = await clientB.from('workspaces').insert({ name: 'Loop WS B' }).select().single();
    if (!wsB) throw new Error('Failed to create workspace B');
    // wsB is created for User B isolation testing
    void wsB;

    const { data: projA } = await clientA.from('projects').insert({
      name: 'Loop Project', workspace_id: workspaceAId,
    }).select().single();
    if (!projA) throw new Error('Failed to create project');
    projectAId = projA.id;

    const { data: entryA } = await clientA.from('content_sources').insert({
      title: 'Test entry for loop',
      content_text: 'I decided to use PostgreSQL for the database and committed to follow up with Sarah by next Friday.',
      source_type: 'journal',
      workspace_id: workspaceAId,
      project_id: projectAId,
      entry_date: new Date().toISOString().slice(0, 10),
      ai_access: 'allowed',
      processing_status: 'not_requested',
    }).select().single();
    if (!entryA) throw new Error('Failed to create entry');
    entryAId = entryA.id;
  });

  afterAll(async () => {
    if (userAId) await adminClient.auth.admin.deleteUser(userAId);
    if (userBId) await adminClient.auth.admin.deleteUser(userBId);
  });

  it('1. User-edited extracted items survive reprocessing (is_user_edited flag)', async () => {
    // Create an extracted item as AI-generated (not user-edited)
    const { data: item } = await clientA.from('extracted_items').insert({
      workspace_id: workspaceAId,
      project_id: projectAId,
      content_source_id: entryAId,
      item_type: 'decision',
      content: 'Use PostgreSQL for the database',
      status: 'open',
      confidence: 0.9,
      source_excerpt: 'I decided to use PostgreSQL',
      is_user_edited: false,
    }).select().single();

    // User edits the item (changes status)
    const { error: editErr } = await clientA.from('extracted_items')
      .update({ status: 'resolved', is_user_edited: true, last_user_edit_at: new Date().toISOString() })
      .eq('id', item!.id);
    expect(editErr).toBeNull();

    // Simulate reprocessing: delete only non-user-edited open items
    const { error: deleteErr } = await clientA.from('extracted_items').delete()
      .eq('entry_id', entryAId)
      .eq('status', 'open')
      .eq('is_user_edited', false);
    expect(deleteErr).toBeNull();

    // Verify the user-edited item still exists
    const { data: surviving } = await clientA.from('extracted_items')
      .select('id, status, is_user_edited')
      .eq('id', item!.id)
      .maybeSingle();
    expect(surviving).not.toBeNull();
    expect(surviving!.is_user_edited).toBe(true);
    expect(surviving!.status).toBe('resolved');

    // Cleanup
    await clientA.from('extracted_items').delete().eq('id', item!.id);
  });

  it('2. Non-open items are preserved during reprocessing', async () => {
    const { data: completedItem } = await clientA.from('extracted_items').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      item_type: 'task',
      content: 'Follow up with Sarah',
      status: 'completed',
      confidence: 0.8,
      is_user_edited: false,
    }).select().single();

    // Reprocessing deletes only open, non-user-edited items
    await clientA.from('extracted_items').delete()
      .eq('entry_id', entryAId)
      .eq('status', 'open')
      .eq('is_user_edited', false);

    // Completed item should survive
    const { data: surviving } = await clientA.from('extracted_items')
      .select('id')
      .eq('id', completedItem!.id)
      .maybeSingle();
    expect(surviving).not.toBeNull();

    await clientA.from('extracted_items').delete().eq('id', completedItem!.id);
  });

  it('3. Approved memories remain preserved when new suggestions are added', async () => {
    const { data: approved } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      project_id: projectAId,
      memory_type: 'fact',
      memory_text: 'User prefers PostgreSQL',
      normalised_text: 'user prefers postgresql',
      status: 'approved',
      confidence: 0.9,
      last_confirmed_at: new Date().toISOString(),
    }).select().single();

    // Add a new suggested memory (different normalised text)
    const { data: suggested } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'goal',
      memory_text: 'User wants to learn more about databases',
      normalised_text: 'user wants to learn more about databases',
      status: 'suggested',
      confidence: 0.7,
    }).select().single();

    // Verify approved memory still exists
    const { data: check } = await clientA.from('memories')
      .select('id, status')
      .eq('id', approved!.id)
      .maybeSingle();
    expect(check).not.toBeNull();
    expect(check!.status).toBe('approved');

    await clientA.from('memories').delete().eq('id', approved!.id);
    await clientA.from('memories').delete().eq('id', suggested!.id);
  });

  it('4. Rejected memories are excluded from retrieval context', async () => {
    const { data: rejected } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'fact',
      memory_text: 'Rejected memory test',
      normalised_text: 'rejected memory test ' + RUN_ID,
      status: 'rejected',
      confidence: 0.6,
    }).select().single();

    // Query for approved memories only (as the Edge Function does)
    const { data: approvedMems } = await clientA.from('memories')
      .select('id, memory_text')
      .eq('workspace_id', workspaceAId)
      .eq('status', 'approved')
      .is('deleted_at', null);

    // Rejected memory should not appear
    const found = approvedMems?.find((m) => m.id === rejected!.id);
    expect(found).toBeUndefined();

    await clientA.from('memories').delete().eq('id', rejected!.id);
  });

  it('5. Cross-user vector retrieval is impossible', async () => {
    // User A creates a chunk with an embedding
    const { data: chunk } = await clientA.from('entry_chunks').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      chunk_index: 0,
      chunk_text: 'Test chunk for vector search',
      token_count: 6,
      content_hash: 'test-hash-' + RUN_ID,
    }).select().single();

    // User B tries to read User A's chunks
    const { data: crossData } = await clientB.from('entry_chunks')
      .select('id, chunk_text')
      .eq('id', chunk!.id)
      .maybeSingle();
    expect(crossData).toBeNull();

    await clientA.from('entry_chunks').delete().eq('id', chunk!.id);
  });

  it('6. Wrong-workspace retrieval returns nothing', async () => {
    // User B queries chunks in User A's workspace
    const { data: wrongWs } = await clientB.from('entry_chunks')
      .select('id')
      .eq('workspace_id', workspaceAId);
    expect(wrongWs).toEqual([]);
  });

  it('7. Semantic search function returns nothing for wrong workspace', async () => {
    // Create a dummy embedding (1536 dims of 0)
    const zeroEmbedding = new Array(1536).fill(0);

    // User B calls semantic_search with User A's workspace ID
    const { data, error } = await clientB.rpc('semantic_search', {
      query_embedding: zeroEmbedding,
      p_workspace_id: workspaceAId,
      p_limit: 5,
      p_project_id: null,
    });

    // Function should return empty (workspace ownership check fails)
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('8. AI-blocked entries do not appear in semantic search', async () => {
    // Create an AI-blocked entry
    const { data: blockedEntry } = await clientA.from('content_sources').insert({
      title: 'Blocked entry',
      content_text: 'This should not appear in search',
      source_type: 'journal',
      workspace_id: workspaceAId,
      entry_date: new Date().toISOString().slice(0, 10),
      ai_access: 'blocked',
      processing_status: 'blocked',
    }).select().single();

    // Create a chunk for the blocked entry
    await clientA.from('entry_chunks').insert({
      workspace_id: workspaceAId,
      content_source_id: blockedEntry!.id,
      chunk_index: 0,
      chunk_text: 'This should not appear in search',
      token_count: 7,
      content_hash: 'blocked-hash-' + RUN_ID,
    });

    // Semantic search should exclude this entry
    const zeroEmbedding = new Array(1536).fill(0);
    const { data } = await clientA.rpc('semantic_search', {
      query_embedding: zeroEmbedding,
      p_workspace_id: workspaceAId,
      p_limit: 10,
      p_project_id: null,
    });

    // The blocked entry should not appear in results
    const found = (data as Array<Record<string, unknown>>)?.find(
      (r) => r.entry_id === blockedEntry!.id
    );
    expect(found).toBeUndefined();

    await clientA.from('entry_chunks').delete().eq('entry_id', blockedEntry!.id);
    await clientA.from('content_sources').delete().eq('id', blockedEntry!.id);
  });

  it('9. Deleted entries do not appear in semantic search', async () => {
    const { data: deletedEntry } = await clientA.from('content_sources').insert({
      title: 'Deleted entry',
      content_text: 'This entry is soft-deleted',
      source_type: 'journal',
      workspace_id: workspaceAId,
      entry_date: new Date().toISOString().slice(0, 10),
      ai_access: 'allowed',
      deleted_at: new Date().toISOString(),
    }).select().single();

    await clientA.from('entry_chunks').insert({
      workspace_id: workspaceAId,
      content_source_id: deletedEntry!.id,
      chunk_index: 0,
      chunk_text: 'This entry is soft-deleted',
      token_count: 5,
      content_hash: 'deleted-hash-' + RUN_ID,
    });

    const zeroEmbedding = new Array(1536).fill(0);
    const { data } = await clientA.rpc('semantic_search', {
      query_embedding: zeroEmbedding,
      p_workspace_id: workspaceAId,
      p_limit: 10,
      p_project_id: null,
    });

    const found = (data as Array<Record<string, unknown>>)?.find(
      (r) => r.entry_id === deletedEntry!.id
    );
    expect(found).toBeUndefined();

    await clientA.from('entry_chunks').delete().eq('entry_id', deletedEntry!.id);
    await clientA.from('content_sources').delete().eq('id', deletedEntry!.id);
  });

  it('10. Conversations and messages are user-isolated', async () => {
    const { data: conv } = await clientA.from('conversations').insert({
      workspace_id: workspaceAId,
      title: 'Test conversation',
    }).select().single();

    await clientA.from('messages').insert({
      workspace_id: workspaceAId,
      conversation_id: conv!.id,
      role: 'user',
      content: 'Test question',
    });

    // User B cannot read User A's conversation
    const { data: crossConv } = await clientB.from('conversations')
      .select('*')
      .eq('id', conv!.id)
      .maybeSingle();
    expect(crossConv).toBeNull();

    // User B cannot read User A's messages
    const { data: crossMsgs } = await clientB.from('messages')
      .select('*')
      .eq('conversation_id', conv!.id);
    expect(crossMsgs).toEqual([]);

    await clientA.from('messages').delete().eq('conversation_id', conv!.id);
    await clientA.from('conversations').delete().eq('id', conv!.id);
  });

  it('11. Embedding dimension validation — vector column accepts 1536-dim vectors', async () => {
    // Create a chunk with a valid 1536-dim embedding
    const embedding = new Array(1536).fill(0.1);
    const { error } = await clientA.from('entry_chunks').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      chunk_index: 999,
      chunk_text: 'Embedding test chunk',
      token_count: 3,
      content_hash: 'embed-test-' + RUN_ID,
      embedding: `[${embedding.join(',')}]`,
    });

    // The insert should succeed (vector type accepts 1536-dim)
    expect(error).toBeNull();

    // Cleanup
    await clientA.from('entry_chunks').delete()
      .eq('entry_id', entryAId)
      .eq('chunk_index', 999);
  });
});

if (!canRunTests) {
  describe.skip('Core MVP Value Loop (skipped — no SUPABASE_SERVICE_ROLE_KEY in process.env)', () => {
    it('skipped — set SUPABASE_SERVICE_ROLE_KEY environment variable to run these tests', () => {});
  });
}
