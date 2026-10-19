import { describe, expect, it } from "vitest";
import { locateQuote, pageForOffset, verifyQuote } from "../src/lib/evidence-locator";
import { countSeparatePassages, reviewEvidence } from "../src/lib/evidence-review";
import { chunkText } from "../src/lib/chunking";
import { effectiveBasis, mergeRisks } from "../src/lib/analysis-runner";
import { parseAnalysisOutput } from "../src/lib/ai/risk-analysis";

describe("locateQuote", () => {
  const content = "Clause 1. The supplier\n  may terminate with \u201C7 days\u201D notice.\nClause 2. Other.";

  it("finds exact matches", () => {
    const loc = locateQuote(content, "Clause 2. Other.");
    expect(content.slice(loc!.start, loc!.end)).toBe("Clause 2. Other.");
  });

  it("tolerates whitespace and typographic quote differences, mapping back to original offsets", () => {
    const loc = locateQuote(content, 'The supplier may terminate with "7 days" notice.');
    expect(loc).not.toBeNull();
    expect(content.slice(loc!.start, loc!.end)).toBe("The supplier\n  may terminate with \u201C7 days\u201D notice.");
  });

  it("returns null for text that is not in the document", () => {
    expect(locateQuote(content, "The supplier may terminate at any time.")).toBeNull();
    expect(locateQuote(content, "   ")).toBeNull();
  });
});

describe("verifyQuote", () => {
  const content = "Clause 1. The supplier\n  may terminate with \u201C7 days\u201D notice \u2013 at will.\nPay on time. Pay on time.";

  it("reports an exact match with no normalizations", () => {
    expect(verifyQuote(content, "Clause 1.")).toMatchObject({ matchType: "exact", matchCount: 1, normalizations: [], start: 0 });
  });

  it("records exactly which normalizations were needed", () => {
    const ws = verifyQuote(content, "The supplier may terminate");
    expect(ws).toMatchObject({ matchType: "normalized", normalizations: ["whitespace"] });
    const all = verifyQuote(content, 'may terminate with "7 days" notice - at will.');
    expect(all).toMatchObject({ matchType: "normalized", normalizations: ["quotes", "dashes"] });
    // The stored span is the original source text, not the normalized form.
    expect(content.slice(all.start!, all.end!)).toBe("may terminate with \u201C7 days\u201D notice \u2013 at will.");
  });

  it("flags quotations that occur more than once as ambiguous", () => {
    expect(verifyQuote(content, "Pay on time.")).toMatchObject({ matchType: "exact", matchCount: 2 });
  });

  it("does not match reworded text", () => {
    expect(verifyQuote(content, "The supplier can terminate with 7 days notice.")).toMatchObject({
      matchType: "not_found",
      start: null,
      matchCount: 0,
    });
  });
});

describe("reviewEvidence", () => {
  const found = { matchType: "exact", start: 0, end: 5, matchCount: 1, normalizations: [] } as const;
  const missing = { matchType: "not_found", start: null, end: null, matchCount: 0, normalizations: [] } as const;
  const base = {
    basis: "direct" as const,
    interpretationNote: null,
    aiNeedsReview: false,
    confidence: 0.9,
    quoteSupport: "supports" as const,
    supportGap: null,
  };

  it("needs no review when every quotation is verified", () => {
    expect(reviewEvidence({ ...base, quotes: [found] })).toEqual({
      evidenceStatus: "verified",
      reviewRequired: false,
      reviewReasons: [],
    });
  });

  it("never reports unverified quotations as verified", () => {
    expect(reviewEvidence({ ...base, quotes: [missing] })).toMatchObject({ evidenceStatus: "unverified", reviewRequired: true });
    const partial = reviewEvidence({ ...base, quotes: [found, missing] });
    expect(partial.evidenceStatus).toBe("partially_verified");
    expect(partial.reviewReasons).toContain("1 of 2 quotations could not be found in the source text.");
  });

  it("requires review for findings without a quotation, interpretations, ambiguity and low confidence", () => {
    expect(reviewEvidence({ ...base, basis: "none", quotes: [] })).toMatchObject({ evidenceStatus: "no_evidence", reviewRequired: true });
    expect(reviewEvidence({ ...base, basis: "inferred", interpretationNote: "x", quotes: [found, found] }).reviewReasons[0]).toMatch(/interpretation/);
    expect(reviewEvidence({ ...base, quotes: [{ ...found, matchCount: 3 }] }).reviewReasons[0]).toMatch(/3 times/);
    expect(reviewEvidence({ ...base, confidence: 0.3, quotes: [found] }).reviewReasons[0]).toMatch(/Low AI confidence/);
  });

  it("derives the basis from the quotes actually provided", () => {
    expect(effectiveBasis({ evidenceBasis: "direct", evidenceQuotes: [] })).toBe("none");
    expect(effectiveBasis({ evidenceBasis: "none", evidenceQuotes: ["q"] })).toBe("inferred");
  });
});

describe("pageForOffset", () => {
  it("maps offsets to 1-based pages", () => {
    expect(pageForOffset([0, 100, 250], 0)).toBe(1);
    expect(pageForOffset([0, 100, 250], 99)).toBe(1);
    expect(pageForOffset([0, 100, 250], 100)).toBe(2);
    expect(pageForOffset([0, 100, 250], 999)).toBe(3);
    expect(pageForOffset(null, 5)).toBeNull();
  });
});

describe("chunkText", () => {
  it("returns one chunk for short text", () => {
    expect(chunkText("short")).toHaveLength(1);
  });

  it("covers every character of long text with overlapping chunks", () => {
    const text = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} ${"x".repeat(200)}.`).join("\n\n");
    const chunks = chunkText(text, 5000, 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.start).toBe(0);
    expect(chunks.at(-1)!.end).toBe(text.length);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.start).toBeLessThan(chunks[i - 1]!.end); // overlap, no gap
    }
    for (const c of chunks) expect(text.slice(c.start, c.end)).toBe(c.text);
  });
});

describe("mergeRisks", () => {
  const base = {
    description: "d".repeat(20),
    category: "Operational" as const,
    businessImpact: "impact",
    recommendedMitigation: "mitigate",
    rationale: "because",
    reviewNotes: null,
    evidenceBasis: "direct" as const,
    interpretationNote: null,
    needsHumanReview: false,
    matchesExistingRiskId: null,
    quoteSupport: "supports" as const,
    supportGap: null,
  };
  it("merges duplicates reported by overlapping sections", () => {
    const merged = mergeRisks([
      [{ ...base, title: "Vendor lock-in", severity: "medium", likelihood: "low", confidence: 0.5, evidenceQuotes: ["a quote"] }],
      [{ ...base, title: "Vendor Lock-In", severity: "high", likelihood: "medium", confidence: 0.8, evidenceQuotes: ["a quote", "b quote"] }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ severity: "high", likelihood: "medium", confidence: 0.8 });
    expect(merged[0]!.evidenceQuotes).toEqual(["a quote", "b quote"]);
    expect(merged[0]!.matchedRiskId).toBeNull();
  });

  it("attaches findings to existing risks by AI-provided id or identical title, ignoring unknown ids", () => {
    const existing = [{ id: 10, title: "Vendor lock-in" }, { id: 11, title: "Key person dependency" }];
    const r = { ...base, severity: "low" as const, likelihood: "low" as const, confidence: 0.5, evidenceQuotes: [] };
    const merged = mergeRisks(
      [
        [{ ...r, title: "Reliance on one vendor", matchesExistingRiskId: 10 }],
        [{ ...r, title: "VENDOR LOCK-IN" }],
        [{ ...r, title: "Unknown id claimed", matchesExistingRiskId: 999 }],
      ],
      existing,
    );
    expect(merged.map((m) => m.matchedRiskId)).toEqual([10, null]);
    expect(merged[1]!.title).toBe("Unknown id claimed");
  });
});

describe("parseAnalysisOutput", () => {
  it("accepts an empty risk list", () => {
    expect(parseAnalysisOutput('{"risks":[]}')).toEqual([]);
  });
  it("rejects non-JSON and schema violations", () => {
    expect(() => parseAnalysisOutput("nope")).toThrow(/not valid JSON/);
    expect(() => parseAnalysisOutput('{"risks":[{"title":"x"}]}')).toThrow(/expected format/);
  });
});

describe("quote support (semantic) is separate from exact matching", () => {
  const found = { matchType: "exact", start: 0, end: 5, matchCount: 1, normalizations: [] } as const;
  const base = {
    basis: "direct" as const,
    interpretationNote: null,
    aiNeedsReview: false,
    confidence: 0.9,
    quoteSupport: "supports" as const,
    supportGap: null,
  };

  it("does not over-flag a single verified quote that the AI says supports the finding", () => {
    expect(reviewEvidence({ ...base, quotes: [found], separatePassages: 1 })).toEqual({
      evidenceStatus: "verified",
      reviewRequired: false,
      reviewReasons: [],
    });
  });

  it("requires review for partial or missing support even though the quote is verified", () => {
    const partial = reviewEvidence({ ...base, quoteSupport: "partial", supportGap: "It does not say who is affected.", quotes: [found] });
    expect(partial).toMatchObject({ evidenceStatus: "verified", reviewRequired: true });
    expect(partial.reviewReasons[0]).toMatch(/only partly supports.*who is affected/);

    const none = reviewEvidence({ ...base, quoteSupport: "does_not_support", quotes: [found] });
    expect(none).toMatchObject({ evidenceStatus: "verified", reviewRequired: true });
    expect(none.reviewReasons[0]).toMatch(/does not support/);

    const invalid = reviewEvidence({ ...base, quoteSupport: "invalid", quotes: [found] });
    expect(invalid.reviewRequired).toBe(true);
    expect(invalid.reviewReasons[0]).toMatch(/did not give a valid assessment/);
  });

  it("does not add a second reason when there are no quotes at all", () => {
    const r = reviewEvidence({ ...base, basis: "none", quoteSupport: "does_not_support", quotes: [] });
    expect(r.reviewReasons).toHaveLength(1);
    expect(r.reviewReasons[0]).toMatch(/No supporting quotation/);
  });

  it("flags a direct label that rests on separate passages, but not an inferred one or a single passage", () => {
    expect(reviewEvidence({ ...base, quotes: [found, found], separatePassages: 2 }).reviewReasons.join(" ")).toMatch(/2 separate passages/);
    expect(reviewEvidence({ ...base, quotes: [found], separatePassages: 1 }).reviewRequired).toBe(false);
    const inferred = reviewEvidence({ ...base, basis: "inferred", interpretationNote: "x", quotes: [found, found], separatePassages: 2 });
    expect(inferred.reviewReasons.join(" ")).not.toMatch(/separate passages/);
  });
});

describe("countSeparatePassages", () => {
  const content = "First sentence. Second sentence.\nThird sentence.\n\nUnrelated paragraph. Another.\nLast line.";
  const span = (text: string, matchCount = 1) => {
    const start = content.indexOf(text);
    return { matchType: "exact", start, end: start + text.length, matchCount, normalizations: [] } as const;
  };
  const missing = { matchType: "not_found", start: null, end: null, matchCount: 0, normalizations: [] } as const;

  it("counts quotes separated by other text as separate passages", () => {
    expect(countSeparatePassages(content, [span("First sentence."), span("Last line.")])).toBe(2);
  });
  it("treats consecutive sentences (whitespace only between them) as one passage", () => {
    expect(countSeparatePassages(content, [span("First sentence."), span("Second sentence.")])).toBe(1);
    expect(countSeparatePassages(content, [span("Second sentence."), span("Third sentence.")])).toBe(1);
  });
  it("treats overlapping or duplicate spans as one passage", () => {
    expect(countSeparatePassages(content, [span("First sentence. Second sentence."), span("Second sentence.")])).toBe(1);
    expect(countSeparatePassages(content, [span("First sentence."), span("First sentence.")])).toBe(1);
  });
  it("ignores quotes that were not found or whose location is ambiguous", () => {
    expect(countSeparatePassages(content, [span("First sentence."), missing, span("Last line.", 2)])).toBe(1);
    expect(countSeparatePassages(content, [])).toBe(0);
  });
});

describe("parseAnalysisOutput: quoteSupport and supportGap validation", () => {
  const risk = {
    title: "Single approver",
    description: "Refunds are approved by one person.",
    category: "Operational",
    severity: "high",
    likelihood: "medium",
    businessImpact: "Fraud could go undetected.",
    recommendedMitigation: "Require dual approval.",
    evidenceQuotes: ["Refunds are approved by one person."],
    evidenceBasis: "direct",
    interpretationNote: null,
    rationale: "Stated directly.",
    confidence: 0.9,
    needsHumanReview: false,
    reviewNotes: null,
    matchesExistingRiskId: null,
  };
  const parse = (extra: Record<string, unknown>) => parseAnalysisOutput(JSON.stringify({ risks: [{ ...risk, ...extra }] }))[0]!;

  it("keeps valid values", () => {
    expect(parse({ quoteSupport: "supports", supportGap: null })).toMatchObject({ quoteSupport: "supports", supportGap: null });
    expect(parse({ quoteSupport: "partial", supportGap: " Missing scope. " })).toMatchObject({
      quoteSupport: "partial",
      supportGap: "Missing scope.",
    });
    expect(parse({ quoteSupport: "does_not_support", supportGap: "Nothing stated." }).quoteSupport).toBe("does_not_support");
  });

  it("never defaults a missing or malformed value to supports", () => {
    expect(parse({ supportGap: null }).quoteSupport).toBe("invalid"); // quoteSupport missing
    expect(parse({ quoteSupport: "supports" }).quoteSupport).toBe("invalid"); // supportGap missing
    expect(parse({ quoteSupport: "yes", supportGap: null }).quoteSupport).toBe("invalid");
    expect(parse({ quoteSupport: "SUPPORTS", supportGap: null }).quoteSupport).toBe("invalid");
    expect(parse({ quoteSupport: true, supportGap: null }).quoteSupport).toBe("invalid");
    expect(parse({ quoteSupport: null, supportGap: null }).quoteSupport).toBe("invalid");
    expect(parse({ quoteSupport: "supports", supportGap: 42 }).quoteSupport).toBe("invalid");
  });
});

describe("mergeRisks keeps the weakest support claim", () => {
  const base = {
    description: "d".repeat(20),
    category: "Operational" as const,
    businessImpact: "impact",
    recommendedMitigation: "mitigate",
    rationale: "because",
    reviewNotes: null,
    evidenceBasis: "direct" as const,
    interpretationNote: null,
    needsHumanReview: false,
    matchesExistingRiskId: null,
    severity: "high" as const,
    likelihood: "low" as const,
    confidence: 0.8,
    evidenceQuotes: ["a quote"],
    title: "Same risk",
  };
  it("does not let a later 'supports' hide an earlier 'partial'", () => {
    const merged = mergeRisks([
      [{ ...base, quoteSupport: "partial", supportGap: "gap one" }],
      [{ ...base, quoteSupport: "supports", supportGap: null }],
    ]);
    expect(merged[0]).toMatchObject({ quoteSupport: "partial", supportGap: "gap one" });
    const worse = mergeRisks([
      [{ ...base, quoteSupport: "supports", supportGap: null }],
      [{ ...base, quoteSupport: "invalid", supportGap: null }],
    ]);
    expect(worse[0]!.quoteSupport).toBe("invalid");
  });
});
