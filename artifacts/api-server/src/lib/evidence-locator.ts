// Locates an AI-provided quote inside the stored document text. A quote is
// "verified" only if it is found; we never accept a quote on the model's word.

export interface QuoteLocation {
  start: number;
  end: number;
}

const CHAR_EQUIVALENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u00A0": " ",
};

/**
 * Collapse whitespace runs to one space and fold typographic quotes/dashes,
 * remembering where each normalized character came from in the original.
 */
function normalizeWithMap(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = CHAR_EQUIVALENTS[s[i]!] ?? s[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace && text.length > 0) {
        text += " ";
        map.push(i);
      }
      inSpace = true;
    } else {
      text += ch;
      map.push(i);
      inSpace = false;
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export function locateQuote(content: string, quote: string): QuoteLocation | null {
  const trimmed = quote.trim();
  if (trimmed.length === 0) return null;

  const exact = content.indexOf(trimmed);
  if (exact !== -1) return { start: exact, end: exact + trimmed.length };

  // Tolerate only formatting differences (line breaks, spacing, curly quotes).
  const doc = normalizeWithMap(content);
  const q = normalizeWithMap(trimmed).text;
  if (q.length === 0) return null;
  const idx = doc.text.indexOf(q);
  if (idx === -1) return null;
  return { start: doc.map[idx]!, end: doc.map[idx + q.length - 1]! + 1 };
}

/** 1-based page number for a character offset, given page start offsets. */
export function pageForOffset(pageOffsets: number[] | null | undefined, offset: number): number | null {
  if (!pageOffsets || pageOffsets.length === 0) return null;
  let lo = 0;
  let hi = pageOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pageOffsets[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
