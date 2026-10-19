import { desc, eq, sql } from "drizzle-orm";
import { db, documentsTable, risksTable } from "@workspace/db";
import { getCurrentPlaybook } from "./playbook";
import type { AssistantAnswer, AssistantSourceKind, CompanySnapshot } from "./ai/assistant";

// Prompt budget for the company data sent with every question.
export const MAX_SNAPSHOT_DOCUMENTS = 40;
export const MAX_SNAPSHOT_RISKS = 150;
export const DOCUMENT_TEXT_BUDGET = 60_000;
export const PER_DOCUMENT_TEXT = 12_000;
const cut = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * The company data the assistant may use. Normal users never get the company
 * rules or any company-rule fields, matching what the rest of the API shows them.
 */
export async function buildCompanySnapshot(isCompany: boolean): Promise<CompanySnapshot> {
  const docs = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      purpose: documentsTable.purpose,
      status: documentsTable.status,
      createdAt: documentsTable.createdAt,
      content: documentsTable.content,
      riskCount: sql<number>`(select count(*)::int from "risks" where "risks"."document_id" = "documents"."id")`,
    })
    .from(documentsTable)
    .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id))
    .limit(MAX_SNAPSHOT_DOCUMENTS);

  let budget = DOCUMENT_TEXT_BUDGET;
  const documents = docs.map((d) => {
    const take = Math.max(0, Math.min(PER_DOCUMENT_TEXT, budget, d.content.length));
    budget -= take;
    return {
      id: d.id,
      title: d.title,
      purpose: d.purpose,
      status: d.status,
      createdAt: d.createdAt.toISOString().slice(0, 10),
      riskCount: d.riskCount,
      excerpt: d.content.slice(0, take),
      truncated: take < d.content.length,
    };
  });

  const rows = await db
    .select({
      id: risksTable.id,
      documentId: risksTable.documentId,
      documentTitle: documentsTable.title,
      title: risksTable.title,
      severity: risksTable.severity,
      status: risksTable.status,
      category: risksTable.category,
      description: risksTable.description,
      recommendedMitigation: risksTable.recommendedMitigation,
      evidenceStatus: risksTable.evidenceStatus,
      reviewRequired: risksTable.reviewRequired,
      playbookGap: risksTable.playbookGap,
    })
    .from(risksTable)
    .innerJoin(documentsTable, eq(documentsTable.id, risksTable.documentId))
    .orderBy(
      sql`case ${risksTable.status} when 'closed' then 1 else 0 end`,
      sql`case ${risksTable.severity} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
      desc(risksTable.updatedAt),
    )
    .limit(MAX_SNAPSHOT_RISKS);

  const risks = rows.map(({ playbookGap, ...r }) => ({
    ...r,
    description: cut(r.description, 500)!,
    recommendedMitigation: cut(r.recommendedMitigation, 400),
    companyRuleGap: isCompany ? cut(playbookGap, 400) : null,
  }));

  const playbook = isCompany ? await getCurrentPlaybook() : null;
  return {
    documents,
    risks,
    companyRules: playbook ? { title: playbook.title, content: playbook.content } : null,
  };
}

const REFUSAL_FALLBACK =
  "Bu sual mənim mövzumdan kənardır. Mən yalnız şirkətinizin sənədləri və riskləri, eləcə də hüquqi suallar barədə kömək edə bilərəm. / I can only help with questions about your company's documents and risks, or legal questions.";

export interface AssistantReplyOut {
  topic: AssistantAnswer["topic"];
  refused: boolean;
  answer: string;
  sources: { kind: AssistantSourceKind; id: number | null; title: string }[];
}

/**
 * Server-side guardrails on the model's reply: off-topic replies carry no
 * sources and are kept short, and every cited source must be a record the
 * user was actually shown. Unknown ids are dropped, never shown.
 */
export function finalizeReply(ai: AssistantAnswer, snapshot: CompanySnapshot): AssistantReplyOut {
  if (ai.topic === "off_topic") {
    const answer = ai.answer.length <= 600 ? ai.answer : REFUSAL_FALLBACK;
    return { topic: "off_topic", refused: true, answer, sources: [] };
  }
  const docs = new Map(snapshot.documents.map((d) => [d.id, d.title]));
  const risks = new Map(snapshot.risks.map((r) => [r.id, r.title]));
  const seen = new Set<string>();
  const sources: AssistantReplyOut["sources"] = [];
  for (const s of ai.sources) {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.kind === "document" && s.id !== null && docs.has(s.id)) sources.push({ kind: "document", id: s.id, title: docs.get(s.id)! });
    else if (s.kind === "risk" && s.id !== null && risks.has(s.id)) sources.push({ kind: "risk", id: s.id, title: risks.get(s.id)! });
    else if (s.kind === "company_rules" && snapshot.companyRules) sources.push({ kind: "company_rules", id: null, title: snapshot.companyRules.title });
  }
  return { topic: ai.topic, refused: false, answer: ai.answer, sources };
}
