import { z } from 'npm:zod';

export const extractionSchema = z.object({
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

export type ExtractionResult = z.infer<typeof extractionSchema>;
