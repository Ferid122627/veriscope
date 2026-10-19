// Locates an AI-provided quote inside the stored document text. A quote is
// "verified" only if it is found; we never accept a quote on the model's word.

// Normalizations are applied only when an exact match fails. Each is a
// formatting difference, never a change of wording. The names are stored with
// the evidence so a reviewer can see what was tolerated.
export const NORMALIZATIONS = ["whitespace", "quotes", "dashes"] as const;
export type Normalization = (typeof NORMALIZATIONS)[number];

const QUOTE_EQUIVALENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
};
const DASH_EQUIVALENTS: Record<string, string> = { "\u2013": "-", "\u2014": "-", "\u2212": "-" };

function foldChar(ch: string, rules: ReadonlySet<Normalization>): string {
  if (rules.has("quotes") && QUOTE_EQUIVALENTS[ch]) return QUOTE_EQUIVALENTS[ch]!;
  if (rules.has("dashes") && DASH_EQUIVALENTS[ch]) return DASH_EQUIVALENTS[ch]!;
  return ch;
}

/**
 * Apply the given normalizations, remembering where each output character
 * came from in the original so a match can be mapped back to exact offsets.
 * "whitespace" collapses any run of whitespace (incl. line breaks, NBSP) to one space.
 */
function normalizeWithMap(s: string, rules: ReadonlySet<Normalization>): { text: string; map: number[] } {
  const collapse = rules.has("whitespace");
  let text = "";
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = foldChar(s[i]!, rules);
    if (collapse && /\s/.test(ch)) {
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
  if (collapse && text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

function countOccurrences(haystack: string, needle: string): { first: number; count: number } {
  let first = -1;
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (first === -1) first = i;
    count++;
  }
  return { first, count };
}

const ALL_RULES: ReadonlySet<Normalization> = new Set(NORMALIZATIONS);

export type QuoteVerification =
  | { matchType: "exact" | "normalized"; start: number; end: number; matchCount: number; normalizations: Normalization[] }
  | { matchType: "not_found"; start: null; end: null; matchCount: 0; normalizations: [] };

/**
 * Check a claimed quotation against the source text. Exact match first; if
 * that fails, retry with formatting normalizations and record which ones were
 * actually needed. matchCount > 1 means the location is ambiguous.
 */
export function verifyQuote(content: string, quote: string): QuoteVerification {
  const notFound = { matchType: "not_found", start: null, end: null, matchCount: 0, normalizations: [] } as const;
  const trimmed = quote.trim();
  if (trimmed.length === 0) return { ...notFound, normalizations: [] };

  const exact = countOccurrences(content, trimmed);
  if (exact.count > 0) {
    return { matchType: "exact", start: exact.first, end: exact.first + trimmed.length, matchCount: exact.count, normalizations: [] };
  }

  const doc = normalizeWithMap(content, ALL_RULES);
  const q = normalizeWithMap(trimmed, ALL_RULES).text;
  if (q.length === 0) return { ...notFound, normalizations: [] };
  const found = countOccurrences(doc.text, q);
  if (found.count === 0) return { ...notFound, normalizations: [] };

  const start = doc.map[found.first]!;
  const end = doc.map[found.first + q.length - 1]! + 1;
  const source = content.slice(start, end);
  // A rule was needed if the texts still differ when every other rule is applied.
  const needed = NORMALIZATIONS.filter((rule) => {
    const others = new Set(NORMALIZATIONS.filter((r) => r !== rule));
    return normalizeWithMap(source, others).text !== normalizeWithMap(trimmed, others).text;
  });
  return { matchType: "normalized", start, end, matchCount: found.count, normalizations: needed.length ? needed : ["whitespace"] };
}

/** Location of a quote in the source, or null if it cannot be found. */
export function locateQuote(content: string, quote: string): { start: number; end: number } | null {
  const v = verifyQuote(content, quote);
  return v.matchType === "not_found" ? null : { start: v.start, end: v.end };
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
