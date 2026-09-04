import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { chunkText, contentHashAsync } from '../_shared/chunking.ts';
import { extractionSchema } from '../_shared/validation.ts';
import { getProvider, PROMPT_VERSION } from '../_shared/ai-provider.ts';
import type { EntryExtraction } from '../_shared/types.ts';

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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    const body = await req.json();
    const contentSourceId = body.content_source_id;

    if (!contentSourceId || typeof contentSourceId !== 'string') {
      return new Response(JSON.stringify({ error: 'content_source_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: source, error: sourceError } = await serviceClient
      .from('content_sources')
      .select('id, user_id, workspace_id, title, content_text, ai_access, deleted_at, processing_status, project_id')
      .eq('id', contentSourceId)
      .maybeSingle();

    if (sourceError) throw sourceError;

    if (!source || source.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Content source not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (source.deleted_at) {
      return new Response(JSON.stringify({ error: 'Content source is deleted' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (source.ai_access !== 'allowed') {
      await serviceClient
        .from('content_sources')
        .update({ processing_status: 'blocked', processing_error: null })
        .eq('id', contentSourceId);

      return new Response(JSON.stringify({ error: 'AI access is blocked for this content source' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create or claim a processing job
    const { data: existingJob } = await serviceClient
      .from('processing_jobs')
      .select('id, status, attempt_count')
      .eq('content_source_id', contentSourceId)
      .in('status', ['pending', 'processing'])
      .maybeSingle();

    let jobId: string;

    if (existingJob) {
      if (existingJob.status === 'processing') {
        await serviceClient
          .from('processing_jobs')
          .update({ status: 'cancelled', completed_at: new Date().toISOString() })
          .eq('id', existingJob.id);
      }
      const { data: newJob, error: jobError } = await serviceClient
        .from('processing_jobs')
        .insert({
          user_id: userId,
          workspace_id: source.workspace_id,
          content_source_id: contentSourceId,
          job_type: 'process_entry',
          status: 'processing',
          attempt_count: (existingJob.attempt_count || 0) + 1,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (jobError) throw jobError;
      jobId = newJob.id;
    } else {
      const { data: newJob, error: jobError } = await serviceClient
        .from('processing_jobs')
        .insert({
          user_id: userId,
          workspace_id: source.workspace_id,
          content_source_id: contentSourceId,
          job_type: 'process_entry',
          status: 'processing',
          attempt_count: 1,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (jobError) throw jobError;
      jobId = newJob.id;
    }

    await serviceClient
      .from('content_sources')
      .update({ processing_status: 'processing', processing_error: null })
      .eq('id', contentSourceId);

    try {
      const fullContent = source.title + '\n\n' + source.content_text;
      const sourceHash = await contentHashAsync(fullContent);

      // Idempotency: skip if content unchanged
      const { data: existingSummary } = await serviceClient
        .from('entry_ai_summaries')
        .select('id')
        .eq('content_source_id', contentSourceId)
        .eq('source_content_hash', sourceHash)
        .maybeSingle();

      if (existingSummary) {
        await serviceClient
          .from('content_sources')
          .update({ processing_status: 'completed', processing_error: null })
          .eq('id', contentSourceId);
        await serviceClient
          .from('processing_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', jobId);
        return new Response(JSON.stringify({ success: true, message: 'Content source already processed (unchanged content)' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get project context if linked
      let projectName: string | undefined;
      let projectDescription: string | undefined;
      if (source.project_id) {
        const { data: project } = await serviceClient
          .from('projects')
          .select('name, description')
          .eq('id', source.project_id)
          .maybeSingle();
        if (project) {
          projectName = project.name;
          projectDescription = project.description || undefined;
        }
      }

      // Call AI extraction provider
      const provider = getProvider();
      const extraction: EntryExtraction = await provider.extractEntry({
        entryId: contentSourceId,
        title: source.title,
        content: source.content_text,
        projectName,
        projectDescription,
      });

      const validated = extractionSchema.parse(extraction);

      // Save summary separately
      await serviceClient
        .from('entry_ai_summaries')
        .upsert({
          user_id: userId,
          workspace_id: source.workspace_id,
          content_source_id: contentSourceId,
          summary_text: validated.summary,
          model_name: Deno.env.get('EXTRACTION_MODEL') || 'gpt-4o-mini',
          prompt_version: PROMPT_VERSION,
          source_content_hash: sourceHash,
        }, { onConflict: 'content_source_id,source_content_hash' });

      // Save chunks with embeddings (replace existing)
      const chunks = chunkText(fullContent);
      if (chunks.length > 0) {
        await serviceClient.from('entry_chunks').delete().eq('content_source_id', contentSourceId);

        const chunkRows = [];
        for (const c of chunks) {
          let embedding: number[] | null = null;
          try {
            embedding = await generateEmbedding(c.chunkText);
          } catch (e) {
            console.error('Embedding generation failed for chunk', c.chunkIndex, e);
          }
          chunkRows.push({
            user_id: userId,
            workspace_id: source.workspace_id,
            content_source_id: contentSourceId,
            chunk_index: c.chunkIndex,
            chunk_text: c.chunkText,
            token_count: c.tokenCount,
            content_hash: sourceHash,
            embedding: embedding ? JSON.stringify(embedding) : null,
          });
        }
        await serviceClient.from('entry_chunks').insert(chunkRows);
      }

      // Upsert entities and link to content source
      for (const ent of validated.entities) {
        const normalisedName = ent.name.toLowerCase().trim();
        const { data: entity } = await serviceClient
          .from('entities')
          .upsert({
            user_id: userId,
            workspace_id: source.workspace_id,
            entity_type: ent.type,
            canonical_name: ent.name,
            normalised_name: normalisedName,
            description: ent.context,
          }, { onConflict: 'user_id,workspace_id,entity_type,normalised_name' })
          .select('id')
          .maybeSingle();

        if (entity) {
          await serviceClient
            .from('entry_entities')
            .upsert({
              user_id: userId,
              workspace_id: source.workspace_id,
              content_source_id: contentSourceId,
              entity_id: entity.id,
              source_excerpt: ent.source_excerpt,
              confidence: ent.confidence,
            }, { onConflict: 'content_source_id,entity_id' });
        }
      }

      // Save extracted items — preserve user-edited and non-open items
      await serviceClient.from('extracted_items').delete()
        .eq('content_source_id', contentSourceId)
        .eq('status', 'open')
        .eq('is_user_edited', false)
        .is('deleted_at', null);

      for (const item of validated.items) {
        await serviceClient.from('extracted_items').insert({
          user_id: userId,
          workspace_id: source.workspace_id,
          project_id: source.project_id || null,
          content_source_id: contentSourceId,
          item_type: item.item_type,
          content: item.content,
          status: 'open',
          due_date: item.due_date || null,
          confidence: item.confidence,
          source_excerpt: item.source_excerpt,
          is_user_edited: false,
        });
      }

      // Save suggested memories with deduplication and source links
      for (const mem of validated.memories) {
        const normalisedText = mem.memory_text.toLowerCase().trim().replace(/\s+/g, ' ');

        const { data: existingMem } = await serviceClient
          .from('memories')
          .select('id')
          .eq('user_id', userId)
          .eq('workspace_id', source.workspace_id)
          .eq('normalised_text', normalisedText)
          .is('deleted_at', null)
          .maybeSingle();

        let memoryId: string;

        if (existingMem) {
          memoryId = existingMem.id;
          await serviceClient
            .from('memory_sources')
            .upsert({
              user_id: userId,
              workspace_id: source.workspace_id,
              memory_id: memoryId,
              content_source_id: contentSourceId,
              source_excerpt: mem.source_excerpt,
            }, { onConflict: 'memory_id,content_source_id' });
        } else {
          const { data: newMem, error: memError } = await serviceClient
            .from('memories')
            .insert({
              user_id: userId,
              workspace_id: source.workspace_id,
              project_id: source.project_id || null,
              memory_type: mem.memory_type,
              memory_text: mem.memory_text,
              normalised_text: normalisedText,
              status: 'suggested',
              confidence: mem.confidence,
              sensitivity: 'low',
              ai_access: 'allowed',
            })
            .select('id')
            .single();

          if (memError) throw memError;
          memoryId = newMem.id;

          await serviceClient.from('memory_sources').insert({
            user_id: userId,
            workspace_id: source.workspace_id,
            memory_id: memoryId,
            content_source_id: contentSourceId,
            source_excerpt: mem.source_excerpt,
          });
        }
      }

      // Mark processing completed
      await serviceClient
        .from('content_sources')
        .update({ processing_status: 'completed', processing_error: null })
        .eq('id', contentSourceId);

      await serviceClient
        .from('processing_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', jobId);

      return new Response(JSON.stringify({ success: true, message: 'Content source processed successfully' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (processingError) {
      const errorMsg = processingError instanceof Error ? processingError.message : 'Unknown processing error';
      const safeError = errorMsg.slice(0, 500);

      await serviceClient
        .from('content_sources')
        .update({ processing_status: 'failed', processing_error: safeError })
        .eq('id', contentSourceId);

      await serviceClient
        .from('processing_jobs')
        .update({ status: 'failed', error_message: safeError, completed_at: new Date().toISOString() })
        .eq('id', jobId);

      return new Response(JSON.stringify({ error: 'Processing failed', detail: safeError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = Deno.env.get('EMBEDDING_MODEL') || 'text-embedding-3-small';

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('OpenAI returned no embedding');
  }
  return embedding as number[];
}
