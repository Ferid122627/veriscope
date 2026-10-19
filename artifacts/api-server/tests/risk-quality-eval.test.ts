// Risk-quality evaluation suite. Everything here is deterministic: the AI call
// is mocked with scripted answers, so the metrics below measure how the SERVER
// pipeline (quote verification, severity calibration, duplicate merging, review
// flagging) treats model output, not how accurate the real model is.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import { db, documentsTable } from "@workspace/db";
import { calibrateSeverity, describeSeverity } from "../src/lib/risk-severity";
import { mergeRisks, sameIssue } from "../src/lib/analysis-runner";
import { verifyQuote } from "../src/lib/evidence-locator";
import { parseAnalysisOutput } from "../src/lib/ai/risk-analysis";

vi.mock("../src/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/ai/client")>();
  return { ...actual, requestStructuredCompletion: vi.fn() };
});
const { requestStructuredCompletion } = await import("../src/lib/ai/client");
const { default: app } = await import("../src/app");
const mockLlm = vi.mocked(requestStructuredCompletion);

process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ??= "http://unused.test";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??= "unused";

const createdIds: number[] = [];
afterAll(async () => {
  if (createdIds.length) await db.delete(documentsTable).where(inArray(documentsTable.id, createdIds));
});
beforeEach(() => mockLlm.mockReset());

// ---------- synthetic documents ----------
const DPA = [
  "DATA PROCESSING AGREEMENT between Acme Retail Ltd (Customer) and Orbit Cloud GmbH (Supplier).",
  "1. Scope. Supplier processes customer order data and customer personal data on behalf of Customer.",
  "2. Subprocessors. Supplier may engage any subprocessor in any country without notice to or consent from Customer.",
  "3. Security incidents. Supplier will notify Customer of a security incident without undue delay.",
  "4. Return of data. On termination Supplier will return Customer data in a standard format.",
  "5. Liability. Supplier's total liability under this agreement is limited to the fees paid in the preceding three months, including for claims arising from a personal data breach.",
  "6. Disputes. Any dispute shall be resolved by a competent court.",
  "7. Notices. Notices must be in writing.",
].join("\n");

const PROTECTIVE = [
  "SERVICES AGREEMENT between Acme Retail Ltd (Customer) and Harbor Systems BV (Supplier).",
  "1. Security incidents. Supplier will notify Customer within 48 hours of becoming aware of a security incident.",
  "2. Deletion. Supplier will delete all Customer data within 30 days after termination and certify the deletion in writing.",
  "3. Liability. The liability cap of 2x annual fees does not apply to personal data breaches or confidentiality breaches.",
  "4. Disputes. Disputes are resolved by the courts of Amsterdam under Dutch law.",
  "5. Subprocessors. Supplier will give 30 days written notice of any new subprocessor and Customer may object.",
].join("\n");

const AMBIGUOUS = [
  "SUPPLY NOTE between Acme Retail Ltd and Delta Parts Inc.",
  "Delivery will take place within a reasonable time after the order is confirmed.",
  "Prices may be adjusted from time to time as the Supplier sees fit.",
].join("\n");

let seq = 0;
async function createDoc(title: string, content: string): Promise<number> {
  const res = await request(app).post("/api/documents").send({ title, content: `${content}\nCase ${title} ${Date.now()}-${seq++}.` });
  expect(res.status).toBe(201);
  createdIds.push(res.body.id);
  return res.body.id;
}

function aiRisk(o: Record<string, unknown> = {}) {
  return {
    title: "Subprocessors may be engaged anywhere without notice",
    description: "Supplier can hand personal data to any subprocessor in any country without telling the customer.",
    category: "Security & Privacy",
    severity: "high",
    likelihood: "medium",
    riskKind: "potential_risk",
    severityReason: "Personal data may leave the customer's control and the customer would not know.",
    businessImpact: "Loss of control over where customer data is processed.",
    recommendedMitigation: "Require advance notice of, and a right to object to, new subprocessors.",
    evidenceQuotes: ["Supplier may engage any subprocessor in any country without notice to or consent from Customer."],
    evidenceBasis: "direct",
    interpretationNote: null,
    rationale: "Stated directly.",
    confidence: 0.9,
    needsHumanReview: false,
    reviewNotes: null,
    matchesExistingRiskId: null,
    quoteSupport: "supports",
    supportGap: null,
    ...o,
  };
}

async function analyze(id: number, risks: unknown[]) {
  mockLlm.mockResolvedValue(JSON.stringify({ risks }));
  const res = await request(app).post(`/api/documents/${id}/analyze`).send({});
  expect(res.status).toBe(202);
  for (let i = 0; i < 100; i++) {
    const doc = await request(app).get(`/api/documents/${id}`);
    if (doc.body.status !== "analyzing") return doc.body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("analysis did not finish");
}

type SavedRisk = {
  id: number; title: string; severity: string; riskKind: string | null; severityReason: string | null;
  evidenceStatus: string; reviewRequired: boolean; reviewReasons: string[];
};
async function savedRisks(documentId: number): Promise<SavedRisk[]> {
  return (await request(app).get(`/api/risks?documentId=${documentId}`)).body;
}

// ---------- severity calibration (cases 1, 2, 3, 7) ----------
const base = { aiSeverity: "high", likelihood: "medium", riskKind: "potential_risk", basis: "direct", quoteSupport: "supports", quotesCited: 1, quotesFound: 1, confidence: 0.9 } as const;

describe("severity calibration", () => {
  it("1. a genuine, well-evidenced high-impact risk stays High", () => {
    const r = calibrateSeverity({ ...base, likelihood: "high" });
    expect(r).toMatchObject({ severity: "high", adjusted: false });
  });

  it("2. a missing clause the AI over-rates as High is held at Medium and explained", () => {
    const r = calibrateSeverity({ ...base, riskKind: "missing_protection", basis: "none", quotesCited: 0, quotesFound: 0 });
    expect(r.severity).toBe("medium");
    expect(describeSeverity("No cure period is stated.", "missing_protection", "high", r)).toMatch(/Lowered from High to Medium: .*gap rather than harm/);
  });

  it("2b. a missing clause is High only when harm is likely, and never Critical", () => {
    expect(calibrateSeverity({ ...base, riskKind: "missing_protection", basis: "none", quotesCited: 0, quotesFound: 0, likelihood: "high" }).severity).toBe("high");
    expect(calibrateSeverity({ ...base, aiSeverity: "critical", riskKind: "missing_protection", likelihood: "high" }).severity).toBe("high");
  });

  it("3. a low-impact omission stays Low (calibration never raises a rating)", () => {
    const r = calibrateSeverity({ ...base, aiSeverity: "low", riskKind: "missing_protection", basis: "none", quotesCited: 0, quotesFound: 0 });
    expect(r).toMatchObject({ severity: "low", adjusted: false });
  });

  it("7. a liability cap covering data-breach claims may be High when quoted and supported", () => {
    expect(calibrateSeverity({ ...base, likelihood: "medium" }).severity).toBe("high");
  });

  it("Critical needs an explicit, fully verified problem", () => {
    const solid = { ...base, aiSeverity: "critical", riskKind: "actual_issue", likelihood: "high" } as const;
    expect(calibrateSeverity(solid).severity).toBe("critical");
    expect(calibrateSeverity({ ...solid, quotesFound: 0 }).severity).toBe("medium");
    expect(calibrateSeverity({ ...solid, basis: "inferred" }).severity).toBe("high");
    expect(calibrateSeverity({ ...solid, riskKind: null }).severity).toBe("high");
    expect(calibrateSeverity({ ...solid, riskKind: "potential_risk" }).severity).toBe("high");
  });

  it("weak evidence or low confidence holds a High at Medium", () => {
    expect(calibrateSeverity({ ...base, quoteSupport: "partial" }).severity).toBe("medium");
    expect(calibrateSeverity({ ...base, quoteSupport: "invalid" }).severity).toBe("medium");
    expect(calibrateSeverity({ ...base, confidence: 0.3 }).severity).toBe("medium");
    expect(calibrateSeverity({ ...base, likelihood: "low" }).severity).toBe("medium");
  });

  it("never raises a severity, for any combination of inputs", () => {
    const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
    for (const aiSeverity of Object.keys(rank) as (keyof typeof rank)[])
      for (const likelihood of ["low", "medium", "high"] as const)
        for (const riskKind of ["missing_protection", "potential_risk", "actual_issue", null] as const)
          for (const quoteSupport of ["supports", "partial", "does_not_support", "invalid"] as const)
            for (const [cited, found] of [[0, 0], [1, 1], [2, 1], [1, 0]] as const)
              for (const confidence of [0.2, 0.9])
                expect(rank[calibrateSeverity({ aiSeverity, likelihood, riskKind, basis: cited ? "direct" : "none", quoteSupport, quotesCited: cited, quotesFound: found, confidence }).severity]).toBeLessThanOrEqual(rank[aiSeverity]);
  });
});

// ---------- quotations (cases 9, 10, 11) ----------
describe("quotation verification", () => {
  it("9. an exact quote is found at its exact offsets", () => {
    const q = "Any dispute shall be resolved by a competent court.";
    const v = verifyQuote(DPA, q);
    expect(v.matchType).toBe("exact");
    if (v.matchType !== "not_found") expect(DPA.slice(v.start, v.end)).toBe(q);
  });

  it("9b. harmless PDF-style whitespace and line-break differences are tolerated and recorded as normalized", () => {
    const v = verifyQuote(DPA, "Any dispute shall be\nresolved   by a competent court.");
    expect(v.matchType).toBe("normalized");
  });

  it("10. a quote that is not in the source is never verified", () => {
    expect(verifyQuote(DPA, "Supplier must delete all Customer data within 30 days.").matchType).toBe("not_found");
  });

  it("11. a quote that starts real but adds invented words is not verified", () => {
    expect(verifyQuote(DPA, "Supplier will notify Customer of a security incident within 24 hours.").matchType).toBe("not_found");
  });

  it("11b. a risk with one real and one invented quote is only partially verified and goes to review", async () => {
    const id = await createDoc("partial quotes", DPA);
    await analyze(id, [aiRisk({ evidenceQuotes: ["Any dispute shall be resolved by a competent court.", "Disputes go to the courts of Paris."], quoteSupport: "supports" })]);
    const [r] = await savedRisks(id);
    expect(r).toMatchObject({ evidenceStatus: "partially_verified", reviewRequired: true });
  });
});

// ---------- duplicates (case 12) ----------
describe("duplicate risks", () => {
  it("12. rephrased titles for one issue merge; distinct issues stay separate", () => {
    expect(sameIssue("No deadline for deleting customer data", "Customer data deletion deadline missing")).toBe(true);
    expect(sameIssue("Liability cap applies to data breach claims", "Liability cap also covers personal data breach claims")).toBe(true);
    expect(sameIssue("No deadline for deleting customer data", "No deadline for notifying customer of security incidents")).toBe(false);
    expect(sameIssue("Liability cap covers data breaches", "Unspecified dispute forum")).toBe(false);
    expect(sameIssue("Short title", "Other")).toBe(false);
  });

  it("12b. mergeRisks collapses sections that report the same issue under different wording", () => {
    const a = parseAnalysisOutput(JSON.stringify({ risks: [aiRisk({ title: "No deadline for deleting customer data" })] }));
    const b = parseAnalysisOutput(JSON.stringify({ risks: [aiRisk({ title: "Customer data deletion deadline missing" }), aiRisk({ title: "Unspecified dispute forum" })] }));
    expect(mergeRisks([a, b])).toHaveLength(2);
  });
});

// ---------- pipeline evaluation (cases 4, 5, 6, 7, 8, 13 + metrics) ----------
interface Planted { key: string; title: string; expected: "low" | "medium" | "high"; quote: string | null }
const PLANTED: Planted[] = [
  { key: "subprocessors", title: "Subprocessors may be engaged anywhere without notice", expected: "high", quote: "Supplier may engage any subprocessor in any country without notice to or consent from Customer." },
  { key: "incident", title: "Security incident notification has no deadline", expected: "medium", quote: "Supplier will notify Customer of a security incident without undue delay." },
  { key: "cap", title: "Liability cap also covers personal data breach claims", expected: "high", quote: "Supplier's total liability under this agreement is limited to the fees paid in the preceding three months, including for claims arising from a personal data breach." },
  { key: "deletion", title: "No deadline for deleting customer data after termination", expected: "medium", quote: null },
  { key: "forum", title: "Dispute forum is not specified", expected: "medium", quote: "Any dispute shall be resolved by a competent court." },
  { key: "notices", title: "No address or method for formal notices", expected: "low", quote: "Notices must be in writing." },
];

describe("pipeline evaluation on a synthetic agreement", () => {
  it("detects planted risks, calibrates severity, verifies quotes, merges duplicates and flags false positives", async () => {
    const id = await createDoc("Eval DPA", DPA);
    const scripted = [
      aiRisk({ title: PLANTED[0]!.title, severity: "high", likelihood: "high" }),
      aiRisk({ title: PLANTED[1]!.title, severity: "high", likelihood: "medium", riskKind: "missing_protection", evidenceQuotes: [PLANTED[1]!.quote], severityReason: "No time limit is stated." }),
      aiRisk({ title: PLANTED[2]!.title, severity: "high", likelihood: "medium", evidenceQuotes: [PLANTED[2]!.quote], category: "Financial" }),
      // Case 5: nothing to quote, AI over-rates it as High.
      aiRisk({ title: PLANTED[3]!.title, severity: "high", likelihood: "medium", riskKind: "missing_protection", evidenceQuotes: [], evidenceBasis: "none", quoteSupport: "does_not_support", reviewNotes: "The agreement has no deletion clause.", needsHumanReview: true }),
      // Case 8: the AI says High; a vague forum is a Low/Medium gap.
      aiRisk({ title: PLANTED[4]!.title, severity: "high", likelihood: "low", riskKind: "missing_protection", evidenceQuotes: [PLANTED[4]!.quote], category: "Legal & Compliance" }),
      aiRisk({ title: PLANTED[5]!.title, severity: "low", likelihood: "low", riskKind: "missing_protection", evidenceQuotes: [PLANTED[5]!.quote], category: "Operational" }),
      // Duplicate of the deletion risk, reworded.
      aiRisk({ title: "Customer data deletion deadline missing", severity: "medium", likelihood: "medium", riskKind: "missing_protection", evidenceQuotes: [], evidenceBasis: "none", quoteSupport: "does_not_support" }),
      // False positive: an invented fact with an invented quote.
      aiRisk({ title: "Supplier stores backups outside the EU", severity: "critical", likelihood: "high", riskKind: "actual_issue", evidenceQuotes: ["Backups are stored in Singapore."], confidence: 0.95 }),
    ];
    await analyze(id, scripted);
    const saved = await savedRisks(id);

    const planted = PLANTED.map((p) => ({ p, hit: saved.find((s) => sameIssue(s.title, p.title)) }));
    const detected = planted.filter((x) => x.hit);
    const confirmed = saved.filter((s) => !s.reviewRequired);
    const confirmedSupported = confirmed.filter((s) => PLANTED.some((p) => sameIssue(s.title, p.title)));
    const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
    const exact = detected.filter((x) => x.hit!.severity === x.p.expected).length;
    const withinOne = detected.filter((x) => Math.abs(rank[x.hit!.severity as keyof typeof rank] - rank[x.p.expected]) <= 1).length;
    const allQuotes = await Promise.all(saved.map(async (s) => (await request(app).get(`/api/risks/${s.id}`)).body.evidence as { verified: boolean; claimedQuote: string }[]));
    const quoteRows = allQuotes.flat();
    const truth = (q: string) => DPA.includes(q.trim());
    const correctVerdicts = quoteRows.filter((e) => e.verified === truth(e.claimedQuote)).length;
    const dupRate = (saved.length - new Set(saved.map((s) => PLANTED.find((p) => sameIssue(s.title, p.title))?.key ?? s.title)).size) / saved.length;

    const metrics = {
      recall: `${detected.length}/${PLANTED.length}`,
      precisionOfConfirmedRisks: `${confirmedSupported.length}/${confirmed.length}`,
      severityExact: `${exact}/${detected.length}`,
      severityWithinOneLevel: `${withinOne}/${detected.length}`,
      highOrCriticalShare: `${saved.filter((s) => rank[s.severity as keyof typeof rank] >= 2).length}/${saved.length}`,
      quoteVerdictAccuracy: `${correctVerdicts}/${quoteRows.length}`,
      duplicateRate: dupRate,
    };
    console.info("EVAL METRICS (scripted AI, synthetic agreement)", JSON.stringify(metrics));

    expect(detected).toHaveLength(PLANTED.length);
    expect(saved).toHaveLength(PLANTED.length + 1); // six planted + the flagged false positive; the duplicate merged
    expect(dupRate).toBe(0);
    expect(exact).toBe(PLANTED.length);
    expect(correctVerdicts).toBe(quoteRows.length);

    // The invented finding is kept but is never confirmed, and cannot be Critical.
    const fake = saved.find((s) => /backups outside/i.test(s.title))!;
    expect(fake).toMatchObject({ evidenceStatus: "unverified", reviewRequired: true });
    expect(fake.severity).not.toBe("critical");
    expect(confirmedSupported).toHaveLength(confirmed.length);

    // Case 5: a missing clause is saved with no quote, flagged for review, explained.
    const del = planted[3]!.hit!;
    expect(del).toMatchObject({ evidenceStatus: "no_evidence", riskKind: "missing_protection", reviewRequired: true, severity: "medium" });
    expect(del.severityReason).toMatch(/Lowered from High to Medium/);
    // Case 6: undefined deadline, quote verified, Medium.
    expect(planted[1]!.hit).toMatchObject({ evidenceStatus: "verified", severity: "medium" });
    // Case 7: the liability cap keeps High with a verified quote.
    expect(planted[2]!.hit).toMatchObject({ evidenceStatus: "verified", severity: "high", reviewRequired: false });
    // Case 8: unspecified forum is not High (a judgement call: Medium).
    expect(planted[4]!.hit!.severity).toBe("medium");
  });
});

describe("false-positive behaviour", () => {
  it("4. a contract with strong protections yields no risks when the model reports none", async () => {
    const id = await createDoc("Protective", PROTECTIVE);
    await analyze(id, []);
    expect(await savedRisks(id)).toHaveLength(0);
  });

  it("4b. a risk about a protection that exists, quoting that very clause as 'does not support', is never confirmed", async () => {
    const id = await createDoc("Protective FP", PROTECTIVE);
    await analyze(id, [aiRisk({
      title: "No security incident notification deadline", riskKind: "missing_protection", severity: "high",
      evidenceQuotes: ["Supplier will notify Customer within 48 hours of becoming aware of a security incident."],
      quoteSupport: "does_not_support", supportGap: "The quote sets a 48 hour deadline, the opposite of the claimed gap.",
    })]);
    const [r] = await savedRisks(id);
    expect(r).toMatchObject({ reviewRequired: true, severity: "medium" });
    expect(r!.reviewReasons.join(" ")).toMatch(/does not support this finding/);
  });

  it("13. ambiguous wording flagged by the model is held for human review at no more than Medium", async () => {
    const id = await createDoc("Ambiguous", AMBIGUOUS);
    await analyze(id, [aiRisk({
      title: "Prices can change at the Supplier's discretion", riskKind: "potential_risk", severity: "high", likelihood: "medium",
      evidenceQuotes: ["Prices may be adjusted from time to time as the Supplier sees fit."],
      quoteSupport: "partial", supportGap: "It is unclear whether a notice period applies elsewhere.", confidence: 0.4, needsHumanReview: true,
    })]);
    const [r] = await savedRisks(id);
    expect(r).toMatchObject({ reviewRequired: true, severity: "medium", evidenceStatus: "verified" });
    expect(r!.severityReason).toMatch(/evidence is weak/);
  });

  it("a response without the new fields is still accepted, treated as unclassified and never Critical", async () => {
    const id = await createDoc("Legacy shape", DPA);
    const { riskKind: _k, severityReason: _r, ...legacy } = aiRisk({ severity: "critical", likelihood: "high" });
    await analyze(id, [legacy]);
    const [r] = await savedRisks(id);
    expect(r).toMatchObject({ severity: "high", riskKind: null });
    expect(r!.severityReason).toMatch(/did not say what kind/);
  });
});

// Cases 14 and 15 (reassessment where new evidence resolves a risk, and where it stays unresolved)
// are covered end to end in reassessment.test.ts: "valid operating evidence" and
// "irrelevant evidence" / "insufficient evidence".

describe("AI rate limiting", () => {
  it("rejects requests beyond the per-client and global limits with 429 and Retry-After, then recovers", async () => {
    const { createRateLimiter } = await import("../src/lib/rate-limit");
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1000, perClient: 2, global: 3, now: () => t });
    const hit = (ip: string) => {
      let status = 200;
      const res = { setHeader: () => res, status: (s: number) => { status = s; return res; }, json: () => res } as never;
      limiter({ ip } as never, res, () => undefined);
      return status;
    };
    expect([hit("a"), hit("a"), hit("a")]).toEqual([200, 200, 429]);
    expect(hit("b")).toBe(200);
    expect(hit("c")).toBe(429); // global cap reached
    t = 1500;
    expect(hit("a")).toBe(200);
  });
});
