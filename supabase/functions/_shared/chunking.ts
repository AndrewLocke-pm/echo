export interface Chunk {
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
}

const MAX_CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function chunkText(text: string): Chunk[] {
  if (!text || !text.trim()) return [];

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim());
      const overlap = current.slice(-OVERLAP_CHARS);
      current = overlap + '\n\n' + para;
    } else {
      current = current.length > 0 ? current + '\n\n' + para : para;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks.map((chunkText, i) => ({
    chunkIndex: i,
    chunkText,
    tokenCount: estimateTokens(chunkText),
  }));
}

export function contentHash(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // Simple deterministic hash using SHA-256
  // Deno has crypto.subtle available
  // For a synchronous fallback, use a simple hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export async function contentHashAsync(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
