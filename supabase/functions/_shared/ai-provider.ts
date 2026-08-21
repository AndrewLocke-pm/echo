import type { EntryExtraction, ExtractEntryInput } from './types.ts';

export interface AIProvider {
  extractEntry(input: ExtractEntryInput): Promise<EntryExtraction>;
}

const PROMPT_VERSION = '1';

const SYSTEM_PROMPT = `You are a thoughtful journal and knowledge-base assistant.
Your job is to analyze a user's journal entry or knowledge note and extract structured information.

## Rules
- Preserve the distinction between what the user stated and what you inferred.
- Do not exaggerate temporary emotion into a durable personal fact.
- Do not diagnose the user.
- Do not infer sensitive attributes (health, sexuality, religion, etc.).
- Do not create a permanent memory from a passing comment without durable value.
- Prefer extracting concerns over permanent memories when evidence is temporary.
- Keep memories concise and standalone.
- Include a supporting source excerpt for every extraction.
- Extract only what the source supports.
- Use lower confidence (0.3–0.6) when meaning is ambiguous.
- Return empty arrays when nothing qualifies.
- Due dates must only be extracted when explicitly supported by the entry text.
- Do not fabricate dates.

## Output format
Return a JSON object with this exact structure:
{
  "summary": "Concise factual summary of the entry",
  "entities": [
    { "name": "Example", "type": "person", "context": "Why this entity matters", "source_excerpt": "Exact quote", "confidence": 0.9 }
  ],
  "memories": [
    { "memory_text": "Standalone durable memory", "memory_type": "project_context", "reason_durable": "Why this may matter", "source_excerpt": "Exact quote", "confidence": 0.8 }
  ],
  "items": [
    { "item_type": "commitment", "content": "Follow up with stakeholder", "source_excerpt": "Exact quote", "due_date": null, "confidence": 0.85 }
  ]
}

Entity types: person, organisation, project, place, topic, system, date
Memory types: preference, goal, fact, relationship, lesson, project_context, timeline_event, current_state, habit
Item types: decision, commitment, concern, question, task, idea
Confidence: 0 to 1 (float)`;

export class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extractEntry(input: ExtractEntryInput): Promise<EntryExtraction> {
    const userPrompt = this.buildPrompt(input);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned no content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('OpenAI returned invalid JSON');
    }

    return parsed as EntryExtraction;
  }

  private buildPrompt(input: ExtractEntryInput): string {
    let prompt = `## Entry Title\n${input.title}\n\n## Entry Content\n${input.content}`;

    if (input.projectName) {
      prompt += `\n\n## Project Context (for reference only — do not invent relationships)`;
      prompt += `\nProject: ${input.projectName}`;
      if (input.projectDescription) {
        prompt += `\nDescription: ${input.projectDescription}`;
      }
    }

    prompt += `\n\nReturn the extraction as valid JSON. Use empty arrays if nothing qualifies.`;
    return prompt;
  }
}

export function getProvider(): AIProvider {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('EXTRACTION_MODEL') || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const provider = Deno.env.get('AI_PROVIDER') || 'openai';

  if (provider === 'anthropic') {
    throw new Error('Anthropic provider not yet implemented');
  }

  return new OpenAIProvider(apiKey, model);
}

export { PROMPT_VERSION };
