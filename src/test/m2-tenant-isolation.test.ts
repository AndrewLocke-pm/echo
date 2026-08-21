/**
 * Milestone 2 Tenant Isolation Tests
 *
 * Extends the Milestone 1 tenant isolation suite to cover all new tables:
 * projects, processing_jobs, entry_chunks, entry_ai_summaries, entities,
 * entry_entities, memories, memory_sources, extracted_items.
 *
 * All RLS assertions use the anon key with authenticated sessions.
 * The service-role key is ONLY used for user creation and cleanup.
 *
 * To run:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npm run test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

const canRunTests = !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !!SUPABASE_SERVICE_ROLE_KEY;
const testSuite = canRunTests ? describe : describe.skip;

const RUN_ID = Date.now().toString();
const USER_A_EMAIL = `m2-a-${RUN_ID}@tenant-isolation.test`;
const USER_A_PASSWORD = 'TestPassword123!';
const USER_B_EMAIL = `m2-b-${RUN_ID}@tenant-isolation.test`;
const USER_B_PASSWORD = 'TestPassword123!';

let adminClient: SupabaseClient;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let userAId: string;
let userBId: string;
let workspaceAId: string;
let workspaceBId: string;
let projectAId: string;
let projectBId: string;
let entryAId: string;
let entityAId: string;

testSuite('Milestone 2: Project Isolation', () => {
  beforeAll(async () => {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD });
    await clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: USER_B_PASSWORD });

    // Create workspaces
    const { data: wsA } = await clientA.from('workspaces').insert({ name: 'WS-A' }).select().single();
    workspaceAId = wsA!.id;
    const { data: wsB } = await clientB.from('workspaces').insert({ name: 'WS-B' }).select().single();
    workspaceBId = wsB!.id;

    // Create projects
    const { data: projA } = await clientA.from('projects').insert({
      name: 'Project Alpha',
      workspace_id: workspaceAId,
    }).select().single();
    projectAId = projA!.id;

    const { data: projB } = await clientB.from('projects').insert({
      name: 'Project Beta',
      workspace_id: workspaceBId,
    }).select().single();
    projectBId = projB!.id;

    // Create entries
    const { data: entryA } = await clientA.from('content_sources').insert({
      title: 'Entry A',
      content_text: 'Content for entry A',
      source_type: 'journal',
      workspace_id: workspaceAId,
      project_id: projectAId,
      entry_date: new Date().toISOString().slice(0, 10),
    }).select().single();
    entryAId = entryA!.id;

    const { data: entryB } = await clientB.from('content_sources').insert({
      title: 'Entry B',
      content_text: 'Content for entry B',
      source_type: 'journal',
      workspace_id: workspaceBId,
      entry_date: new Date().toISOString().slice(0, 10),
    }).select().single();
    // entryB created for cross-user isolation testing; ID not stored
    void entryB;

    // Create entity for User A
    const { data: entA } = await clientA.from('entities').insert({
      entity_type: 'person',
      canonical_name: 'John Doe',
      normalised_name: 'john doe',
      workspace_id: workspaceAId,
    }).select().single();
    entityAId = entA!.id;
  });

  afterAll(async () => {
    if (userAId) await adminClient.auth.admin.deleteUser(userAId);
    if (userBId) await adminClient.auth.admin.deleteUser(userBId);
  });

  it("1. User B cannot read User A's project", async () => {
    const { data, error } = await clientB
      .from('projects')
      .select('*')
      .eq('id', projectAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("2. User A cannot create an entry linked to User B's project", async () => {
    const { data, error } = await clientA.from('content_sources').insert({
      title: 'Cross-project attempt',
      content_text: 'Should fail',
      source_type: 'journal',
      workspace_id: workspaceAId,
      project_id: projectBId,
      entry_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('3. A project cannot belong to a mismatched workspace', async () => {
    const { error } = await clientA.from('projects').insert({
      name: 'Cross-workspace project',
      workspace_id: workspaceBId,
    });
    expect(error).not.toBeNull();
  });

  it('4. Soft-deleted projects are excluded from normal lists', async () => {
    const { data: proj } = await clientA.from('projects').insert({
      name: 'To be archived',
      workspace_id: workspaceAId,
    }).select().single();

    await clientA.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', proj!.id);

    const { data } = await clientA
      .from('projects')
      .select('id')
      .eq('id', proj!.id)
      .is('deleted_at', null)
      .maybeSingle();
    expect(data).toBeNull();

    // Restore for cleanup
    await clientA.from('projects').delete().eq('id', proj!.id);
  });
});

testSuite('Milestone 2: Processing Security', () => {
  it("5. User B cannot read User A's processing jobs", async () => {
    // Create a processing job as User A
    const { data: job } = await clientA.from('processing_jobs').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      status: 'pending',
    }).select().single();

    const { data, error } = await clientB
      .from('processing_jobs')
      .select('*')
      .eq('id', job!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('processing_jobs').delete().eq('id', job!.id);
  });

  it("6. User B cannot read User A's entry chunks", async () => {
    const { data: chunk } = await clientA.from('entry_chunks').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      chunk_index: 0,
      chunk_text: 'Test chunk',
      token_count: 2,
      content_hash: 'abc123',
    }).select().single();

    const { data, error } = await clientB
      .from('entry_chunks')
      .select('*')
      .eq('id', chunk!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('entry_chunks').delete().eq('id', chunk!.id);
  });

  it("7. User B cannot read User A's AI summaries", async () => {
    const { data: summary } = await clientA.from('entry_ai_summaries').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      summary_text: 'AI summary',
      model_name: 'gpt-4o-mini',
      prompt_version: '1',
      source_content_hash: 'abc123',
    }).select().single();

    const { data, error } = await clientB
      .from('entry_ai_summaries')
      .select('*')
      .eq('id', summary!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('entry_ai_summaries').delete().eq('id', summary!.id);
  });

  it("8. User B cannot read User A's entities", async () => {
    const { data, error } = await clientB
      .from('entities')
      .select('*')
      .eq('id', entityAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("9. User B cannot read User A's entry_entities", async () => {
    const { data: ee } = await clientA.from('entry_entities').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      entity_id: entityAId,
      source_excerpt: 'Test excerpt',
      confidence: 0.9,
    }).select().single();

    const { data, error } = await clientB
      .from('entry_entities')
      .select('*')
      .eq('id', ee!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('entry_entities').delete().eq('id', ee!.id);
  });

  it("10. User B cannot read User A's memories", async () => {
    const { data: mem } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'fact',
      memory_text: 'User A prefers morning meetings',
      normalised_text: 'user a prefers morning meetings',
      status: 'suggested',
      confidence: 0.8,
    }).select().single();

    const { data, error } = await clientB
      .from('memories')
      .select('*')
      .eq('id', mem!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('memories').delete().eq('id', mem!.id);
  });

  it("11. User B cannot read User A's memory_sources", async () => {
    const { data: mem } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'fact',
      memory_text: 'Another memory A',
      normalised_text: 'another memory a',
      status: 'suggested',
      confidence: 0.7,
    }).select().single();

    const { data: src } = await clientA.from('memory_sources').insert({
      workspace_id: workspaceAId,
      memory_id: mem!.id,
      content_source_id: entryAId,
      source_excerpt: 'Source excerpt',
    }).select().single();

    const { data, error } = await clientB
      .from('memory_sources')
      .select('*')
      .eq('id', src!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('memory_sources').delete().eq('id', src!.id);
    await clientA.from('memories').delete().eq('id', mem!.id);
  });

  it("12. User B cannot read User A's extracted_items", async () => {
    const { data: item } = await clientA.from('extracted_items').insert({
      workspace_id: workspaceAId,
      project_id: projectAId,
      content_source_id: entryAId,
      item_type: 'decision',
      content: 'Decided to use PostgreSQL',
      status: 'open',
      confidence: 0.9,
      source_excerpt: 'We decided to use PostgreSQL',
    }).select().single();

    const { data, error } = await clientB
      .from('extracted_items')
      .select('*')
      .eq('id', item!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    await clientA.from('extracted_items').delete().eq('id', item!.id);
  });

  it('13. Duplicate active processing jobs are prevented', async () => {
    const { data: job1 } = await clientA.from('processing_jobs').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      status: 'pending',
    }).select().single();

    // Attempt to create a second pending job for the same entry
    const { error } = await clientA.from('processing_jobs').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      status: 'pending',
    });

    expect(error).not.toBeNull();

    await clientA.from('processing_jobs').delete().eq('id', job1!.id);
  });

  it('14. Entity deduplication prevents duplicates', async () => {
    const { data: ent1 } = await clientA.from('entities').insert({
      entity_type: 'person',
      canonical_name: 'Jane Smith',
      normalised_name: 'jane smith',
      workspace_id: workspaceAId,
    }).select().single();

    // Attempt to create a duplicate
    const { error } = await clientA.from('entities').insert({
      entity_type: 'person',
      canonical_name: 'Jane Smith',
      normalised_name: 'jane smith',
      workspace_id: workspaceAId,
    });

    expect(error).not.toBeNull();

    await clientA.from('entities').delete().eq('id', ent1!.id);
  });

  it('15. Entry-entity link deduplication prevents duplicates', async () => {
    const { data: ee1 } = await clientA.from('entry_entities').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      entity_id: entityAId,
      confidence: 0.9,
    }).select().single();

    // Attempt duplicate
    const { error } = await clientA.from('entry_entities').insert({
      workspace_id: workspaceAId,
      content_source_id: entryAId,
      entity_id: entityAId,
      confidence: 0.8,
    });

    expect(error).not.toBeNull();

    await clientA.from('entry_entities').delete().eq('id', ee1!.id);
  });

  it('16. Memory deduplication prevents exact duplicates', async () => {
    const normText = 'unique memory for dedup test';
    const { data: mem1 } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'fact',
      memory_text: normText,
      normalised_text: normText,
      status: 'suggested',
      confidence: 0.8,
    }).select().single();

    // Attempt duplicate
    const { error } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'fact',
      memory_text: normText,
      normalised_text: normText,
      status: 'suggested',
      confidence: 0.7,
    });

    expect(error).not.toBeNull();

    await clientA.from('memories').delete().eq('id', mem1!.id);
  });

  it('17. Memory-source link deduplication prevents duplicates', async () => {
    const { data: mem } = await clientA.from('memories').insert({
      workspace_id: workspaceAId,
      memory_type: 'fact',
      memory_text: 'Memory for source dedup',
      normalised_text: 'memory for source dedup',
      status: 'suggested',
      confidence: 0.7,
    }).select().single();

    const { data: src1 } = await clientA.from('memory_sources').insert({
      workspace_id: workspaceAId,
      memory_id: mem!.id,
      content_source_id: entryAId,
      source_excerpt: 'Excerpt 1',
    }).select().single();

    // Attempt duplicate link
    const { error } = await clientA.from('memory_sources').insert({
      workspace_id: workspaceAId,
      memory_id: mem!.id,
      content_source_id: entryAId,
      source_excerpt: 'Excerpt 2',
    });

    expect(error).not.toBeNull();

    await clientA.from('memory_sources').delete().eq('id', src1!.id);
    await clientA.from('memories').delete().eq('id', mem!.id);
  });
});

if (!canRunTests) {
  describe.skip('Milestone 2 Tenant Isolation (skipped — no SUPABASE_SERVICE_ROLE_KEY in process.env)', () => {
    it('skipped — set SUPABASE_SERVICE_ROLE_KEY environment variable to run these tests', () => {});
  });
}
