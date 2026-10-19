export interface TextChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

export const CHUNK_SIZE = 24_000;
export const CHUNK_OVERLAP = 800;

/**
 * Split text into overlapping sections that together cover every character.
 * Breaks prefer paragraph, then line, then sentence boundaries near the end
 * of each window so clauses are rarely cut in half; the overlap catches the rest.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): TextChunk[] {
  if (text.length <= size) return [{ index: 0, start: 0, end: text.length, text }];

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const windowStart = start + Math.floor(size * 0.75);
      const window = text.slice(windowStart, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
      );
      if (breakAt > 0) end = windowStart + breakAt + 1;
    }
    chunks.push({ index: chunks.length, start, end, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
