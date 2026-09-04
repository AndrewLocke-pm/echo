/**
 * Extraction Schema Validation Tests
 *
 * Tests the Zod validation schema used by the process-entry Edge Function
 * to validate AI provider output before inserting into the database.
 *
 * These tests run without a database connection — they test the
 * validation logic directly using the same schema structure as the
 * Edge Function's validation module.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirror of the Edge Function's extractionSchema (supabase/functions/_shared/validation.ts)
// Kept in sync manually — the Edge Function uses npm:zod for Deno compatibility
const extractionSchema = z.object({
  summary: z.string().min(1).max(2000),
  entities: z.array(
    z.object({
      name: z.string().min(1).max(200),
      type: z.enum(['person', 'organisation', 'project', 'place', 'topic', 'system', 'date']),
      context: z.string().max(500),
      source_excerpt: z.string().max(1000),
      confidence: z.number().min(0).max(1),
    })
  ).max(50),
  memories: z.array(
    z.object({
      memory_text: z.string().min(1).max(500),
      memory_type: z.enum([
        'preference',
        'goal',
        'fact',
        'relationship',
        'lesson',
        'project_context',
        'timeline_event',
        'current_state',
        'habit',
      ]),
      reason_durable: z.string().max(500),
      source_excerpt: z.string().max(1000),
      confidence: z.number().min(0).max(1),
    })
  ).max(30),
  items: z.array(
    z.object({
      item_type: z.enum(['decision', 'commitment', 'concern', 'question', 'task', 'idea']),
      content: z.string().min(1).max(500),
      source_excerpt: z.string().max(1000),
      due_date: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    })
  ).max(50),
});

describe('Extraction Schema Validation', () => {
  const validExtraction = {
    summary: 'The user had a productive meeting about project timeline.',
    entities: [
      {
        name: 'Sarah Chen',
        type: 'person',
        context: 'Project lead for the migration',
        source_excerpt: 'Sarah said the migration should finish by Q3',
        confidence: 0.92,
      },
    ],
    memories: [
      {
        memory_text: 'Sarah Chen is the project lead for the migration',
        memory_type: 'fact',
        reason_durable: 'Identifies a key person for an ongoing project',
        source_excerpt: 'Sarah said the migration should finish by Q3',
        confidence: 0.84,
      },
    ],
    items: [
      {
        item_type: 'commitment',
        content: 'Follow up with the stakeholder about the timeline',
        source_excerpt: 'I need to follow up with the stakeholder',
        due_date: null,
        confidence: 0.89,
      },
    ],
  };

  it('1. Valid extraction JSON passes validation', () => {
    const result = extractionSchema.safeParse(validExtraction);
    expect(result.success).toBe(true);
  });

  it('2. Malformed JSON (missing summary) fails', () => {
    const malformed = { ...validExtraction, summary: '' };
    const result = extractionSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  it('3. Unknown entity type fails', () => {
    const bad = {
      ...validExtraction,
      entities: [{ ...validExtraction.entities[0], type: 'animal' }],
    };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('4. Confidence above 1 fails', () => {
    const bad = {
      ...validExtraction,
      entities: [{ ...validExtraction.entities[0], confidence: 1.5 }],
    };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('5. Confidence below 0 fails', () => {
    const bad = {
      ...validExtraction,
      entities: [{ ...validExtraction.entities[0], confidence: -0.1 }],
    };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('6. Invalid due_date (non-null non-string) fails', () => {
    const bad = {
      ...validExtraction,
      items: [{ ...validExtraction.items[0], due_date: 42 }],
    };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('7. Unsupported item type fails', () => {
    const bad = {
      ...validExtraction,
      items: [{ ...validExtraction.items[0], item_type: 'reminder' }],
    };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('8. Unknown memory type fails', () => {
    const bad = {
      ...validExtraction,
      memories: [{ ...validExtraction.memories[0], memory_type: 'random' }],
    };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('9. Empty arrays are valid', () => {
    const empty = {
      summary: 'A short entry with nothing to extract.',
      entities: [],
      memories: [],
      items: [],
    };
    const result = extractionSchema.safeParse(empty);
    expect(result.success).toBe(true);
  });

  it('10. Null due_date is valid', () => {
    const valid = {
      ...validExtraction,
      items: [{ ...validExtraction.items[0], due_date: null }],
    };
    const result = extractionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('11. String due_date is valid', () => {
    const valid = {
      ...validExtraction,
      items: [{ ...validExtraction.items[0], due_date: '2025-12-01' }],
    };
    const result = extractionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('12. Missing top-level fields fail', () => {
    const bad = { summary: 'just a summary' };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('13. Excessively long summary fails', () => {
    const bad = { ...validExtraction, summary: 'x'.repeat(2001) };
    const result = extractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
