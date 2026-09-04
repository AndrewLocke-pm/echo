import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    const body = await req.json();
    const { question, workspace_id, project_id, conversation_id, history } = body;


    if (!question || typeof question !== 'string' || !question.trim()) {
      return new Response(JSON.stringify({ error: 'Question is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!workspace_id || typeof workspace_id !== 'string') {
      return new Response(JSON.stringify({ error: 'workspace_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify workspace ownership
    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('id, name')
      .eq('id', workspace_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Embed the question
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const embeddingModel = Deno.env.get('EMBEDDING_MODEL') || 'text-embedding-3-small';
    const chatModel = Deno.env.get('CHAT_MODEL') || 'gpt-4o-mini';

    const embedResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: embeddingModel, input: question }),
    });

    if (!embedResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to embed question' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const embedData = await embedResponse.json();
    const questionEmbedding = embedData.data?.[0]?.embedding;
    if (!questionEmbedding) {
      return new Response(JSON.stringify({ error: 'Failed to embed question' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hybrid retrieval
    // 1. Semantic search via RPC
    const { data: semanticResults } = await serviceClient
      .rpc('semantic_search', {
        query_embedding: questionEmbedding,
        p_workspace_id: workspace_id,
        p_limit: 5,
        p_project_id: project_id || null,
      });

    // 2. Full-text search
    let ftsQuery = serviceClient
      .from('content_sources')
      .select('id, title, content_text, entry_date')
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .eq('ai_access', 'allowed')
      .textSearch('search_vector', question.trim())
      .limit(5);
    if (project_id) ftsQuery = ftsQuery.eq('project_id', project_id);
    const { data: ftsResults } = await ftsQuery;

    // 3. Approved memories
    let memQuery = serviceClient
      .from('memories')
      .select('id, memory_text, memory_type, confidence')
      .eq('workspace_id', workspace_id)
      .eq('status', 'approved')
      .eq('ai_access', 'allowed')
      .is('deleted_at', null)
      .limit(5);
    if (project_id) memQuery = memQuery.eq('project_id', project_id);
    const { data: memoryResults } = await memQuery;

    // 4. Relevant extracted items
    let itemQuery = serviceClient
      .from('extracted_items')
      .select('id, item_type, content, status, source_excerpt')
      .eq('workspace_id', workspace_id)
      .in('status', ['open', 'resolved'])
      .is('deleted_at', null)
      .limit(5);
    if (project_id) itemQuery = itemQuery.eq('project_id', project_id);
    const { data: itemResults } = await itemQuery;

    // Build context and sources
    const sources: Array<{
      content_source_id: string;
      source_title: string;
      source_date: string;
      excerpt: string;
      source_type: string;
      similarity?: number;
    }> = [];

    // Add semantic results
    for (const r of (semanticResults as Array<Record<string, unknown>>) || []) {
      sources.push({
        content_source_id: r.content_source_id as string,
        source_title: r.source_title as string,
        source_date: r.source_date as string,
        excerpt: r.excerpt as string,
        source_type: 'content_source',
        similarity: r.similarity as number | undefined,
      });
    }

    // Add FTS results (deduplicate by content_source_id)
    const seenIds = new Set(sources.map((s) => s.content_source_id));
    for (const r of (ftsResults as Array<Record<string, unknown>>) || []) {
      const sourceId = r.id as string;
      if (!seenIds.has(sourceId)) {
        seenIds.add(sourceId);
        sources.push({
          content_source_id: sourceId,
          source_title: r.title as string,
          source_date: r.entry_date as string,
          excerpt: (r.content_text as string).slice(0, 300),
          source_type: 'content_source',
        });
      }
    }

    // Build context text for the LLM
    let contextText = '## Relevant journal entries and notes\n';
    for (const s of sources.slice(0, 8)) {
      contextText += `\n### ${s.source_title} (${s.source_date})\n${s.excerpt}\n`;
    }

    if (memoryResults && memoryResults.length > 0) {
      contextText += '\n## Approved memories\n';
      for (const m of memoryResults as Array<Record<string, unknown>>) {
        contextText += `- ${m.memory_text}\n`;
      }
    }

    if (itemResults && itemResults.length > 0) {
      contextText += '\n## Relevant extracted items\n';
      for (const i of itemResults as Array<Record<string, unknown>>) {
        contextText += `- [${i.item_type}] ${i.content}\n`;
      }
    }

    // Build messages for chat
    const systemPrompt = `You are a thoughtful assistant helping the user reflect on their journal entries, notes, and memories.

## Rules
- Answer based ONLY on the provided context. Do not cite sources that were not provided.
- If evidence is incomplete or insufficient, say so clearly.
- If sources conflict, acknowledge the conflict.
- Avoid presenting interpretation as definite fact.
- Prefer original entries as evidence where available.
- Do not use rejected memories.
- Keep answers concise and grounded.
- If the context does not contain relevant information, say "I don't have enough information to answer that."`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `## Context\n${contextText}` },
    ];

    // Add conversation history
    if (history && Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        messages.push({ role: h.role, content: h.content });
      }
    }

    messages.push({ role: 'user', content: question });

    // Call OpenAI
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: chatModel,
        messages,
        temperature: 0.3,
      }),
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      return new Response(JSON.stringify({ error: 'AI service error', detail: errText.slice(0, 200) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatData = await chatResponse.json();
    const answer = chatData.choices?.[0]?.message?.content;

    if (!answer) {
      return new Response(JSON.stringify({ error: 'No answer generated' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persist conversation and messages
    let convId = conversation_id;
    if (!convId) {
      const title = question.slice(0, 80);
      const { data: newConv } = await serviceClient
        .from('conversations')
        .insert({
          user_id: userId,
          workspace_id,
          project_id: project_id || null,
          title,
        })
        .select('id')
        .single();
      convId = newConv?.id;
    } else {
      await serviceClient
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);
    }

    // Save user message
    await serviceClient.from('messages').insert({
      user_id: userId,
      workspace_id,
      conversation_id: convId,
      role: 'user',
      content: question,
    });

    // Save assistant message with sources
    await serviceClient.from('messages').insert({
      user_id: userId,
      workspace_id,
      conversation_id: convId,
      role: 'assistant',
      content: answer,
      sources_json: sources,
      model_name: chatModel,
    });

    return new Response(JSON.stringify({
      answer,
      sources,
      conversation_id: convId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
