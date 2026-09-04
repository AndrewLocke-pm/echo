/**
 * Chunking Utility Tests
 *
 * Tests the chunkText utility used by the process-entry Edge Function
 * to split entry content into ordered chunks for retrieval and search.
 *
 * These tests run without a database connection.
 */

import { describe, it, expect } from 'vitest';
import { chunkText } from '../../supabase/functions/_shared/chunking';

describe('Chunking Utility', () => {
  it('1. Short entries produce one chunk', () => {
    const text = 'This is a short entry about a meeting.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].chunkText).toBe(text);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it('2. Long entries produce multiple chunks', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i}: ${'Lorem ipsum dolor sit amet. '.repeat(20)}`
    );
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it('3. Paragraphs remain ordered', () => {
    const paragraphs = [
      'First paragraph about alpha.',
      'Second paragraph about beta.',
      'Third paragraph about gamma.',
    ];
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunkText).toContain('alpha');
    expect(chunks[0].chunkText).toContain('beta');
    expect(chunks[0].chunkText).toContain('gamma');
  });

  it('4. Blank entries produce no chunks', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText('\n\n\n')).toEqual([]);
  });

  it('5. Chunk indices are sequential starting from 0', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      `Section ${i}: ${'Content word here. '.repeat(30)}`
    );
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it('6. Token count is positive for non-empty chunks', () => {
    const chunks = chunkText('Some content here.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it('7. Paragraph boundaries are preserved where possible', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const chunks = chunkText(text);
    expect(chunks[0].chunkText).toContain('First paragraph');
    expect(chunks[0].chunkText).toContain('Second paragraph');
    expect(chunks[0].chunkText).toContain('Third paragraph');
  });

  it('8. Multiple paragraphs that exceed max chunk size split into separate chunks', () => {
    const longPara1 = 'A'.repeat(1200) + '.';
    const longPara2 = 'B'.repeat(1200) + '.';
    const text = `${longPara1}\n\n${longPara2}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkText).toContain('A');
    expect(chunks[1].chunkText).toContain('B');
  });
});
