# Veriscope

AI-powered enterprise risk management: add business documents, identify risks backed by verbatim evidence verified against the source text, track mitigation actions, and reassess new evidence to decide whether a risk is actually resolved.

## Run & Operate

- Workflows (start/restart from the Replit UI, not root `pnpm dev`):
  - `artifacts/api-server: API Server` — Express API on `/api`
  - `artifacts/veriscope: web` — React dashboard on `/`
- `pnpm --filter @workspace/api-server test` — API integration tests (Vitest + Supertest, real dev DB, self-cleaning)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate React Query hooks + Zod schemas after editing `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — apply Drizzle schema to the dev DB (production schema is applied by Publish)
- Required env: `DATABASE_URL` (Replit Postgres), `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit AI Integrations; no personal key, usage billed to Replit credits). Without the AI vars the app runs but analysis returns 503.
- Sample documents for demos: `samples/supplier-agreement.pdf` (3 pages), `samples/continuity-memo.docx`; follow-up evidence for reassessing the data-processing risk: `samples/evidence-*.txt` (executed / promise / conflicting / unrelated)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, pino logging, multer (uploads), unpdf (PDF text), mammoth (DOCX text)
- AI: OpenAI via Replit AI Integrations (`gpt-5.6-terra`, strict JSON-schema output, then Zod validation)
- DB: Replit PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), generated from OpenAPI via Orval
- Frontend: React + Vite, TanStack Query, wouter, Tailwind/shadcn
- Tests: Vitest + Supertest (api-server)

## Where things live

- API contract (source of truth): `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/` (documents, analysis-runs, risks, evidence, assessments, mitigation-actions, reassessments)
- API routes: `artifacts/api-server/src/routes/`
- API tests: `artifacts/api-server/tests/`
- Frontend: `artifacts/veriscope/src/`
- ECC skills (project-scoped): `.agents/skills/`

## Architecture decisions

- Postgres + Drizzle kept from the template instead of SQLite + Prisma: already wired, persists across publishes (a SQLite file in a published app resets on redeploy), and avoids an ORM swap.
- `documents.content` is the extracted text and is immutable; evidence `startOffset`/`endOffset` index into it, and `evidence.verified` is true only for verbatim matches.
- Assessments are append-only history (one row per AI judgement); risk `status` is the current state.
- Dashboard activity is derived from real rows, not a separate event log.
- Duplicate documents are blocked by a unique sha256 of the extracted text (409 with `existingDocumentId`).
- PDF risk report: `GET /api/documents/:id/report.pdf` (pdfkit, built from one read-only snapshot). Fonts ship in `artifacts/api-server/assets/fonts`; `pdfkit` is external in `build.mjs` because it reads its own data files at runtime.
- Upload limits: 10 MB file, 400,000 characters of text (rejected, never truncated). Type is checked by magic bytes as well as extension. Image-only PDFs are rejected with an explicit "no OCR" message.
- Analysis runs in-process in the background: `POST /documents/:id/analyze` atomically claims the document (status → analyzing) so double submits get 409; the client polls the document. Documents left "analyzing" by a server restart are marked failed on startup.
- Long text is split into ~24k-char overlapping sections (3 in parallel); duplicate risks across sections are merged by title. Progress = chunksDone/chunksTotal.
- Document text is passed to the model only inside a `<document>` block declared as untrusted data.
- Every run is saved in one transaction; a failed run changes nothing but the run/document status. Each run is recorded in `analysis_runs` (counts of new / matched / not-detected risks).
- Evidence verification is deterministic and only against the stored text: exact match first, then a normalized match (whitespace / typographic quotes / dashes only, never wording). Each evidence row keeps the AI's `claimedQuote`, the exact source slice as `quote`, `matchType`, the `normalizations` actually needed, and `matchCount` (>1 = ambiguous location). Unfound quotes are stored with `verified=false` and null offsets.
- Risk `evidenceStatus`, `reviewRequired` and `reviewReasons` are computed by the server (`lib/evidence-review.ts`), never by the AI. Review is required for: no quotation, any unfound quote, inferred (interpretation) findings, ambiguous quotes, AI-flagged uncertainty, confidence < 0.5, or not detected on re-analysis.
- Evidence basis: `direct` (quote states the risk), `inferred` (interpretation of several quoted passages, with `interpretationNote`), `none` (no quotable support; kept and flagged, never given an invented quote). The server forces `none` when no quotes are returned.
- Re-analysis (`rerun: true`) never deletes risks. The model sees the document's existing risks and may set `matchesExistingRiskId`; the server accepts only ids belonging to that document, else falls back to an identical-title match. Matched risks keep id, title and human-set status, update current fields and gain a `reanalysis` assessment; new issues get a new risk + one mitigation action; unmatched existing risks get a `not_detected` assessment and are flagged for review (not resolved).
- A risk's current evidence = evidence of its latest `identified` assessment (plus manually added evidence with no assessment). Older evidence stays attached to its own assessment and is shown in the history. Dashboard evidence totals count current evidence only.
- Deleting a document cascades to its risks, evidence, actions and assessments.
- Risk status (open / mitigating / closed) changes only through `POST /risks/:id/status`, which records who, why and the previous status in `risk_status_changes`. Closing needs `approveClosure: true`, a name and a justification of 10+ characters. Nothing else (actions, uploads, analysis, reassessment, accepting a recommendation) changes the status.
- Action statuses are open / in_progress / submitted_for_review; there is no "done", because finishing an action is not proof the risk is gone.
- Reassessment (`POST /risks/:id/reassessments`, one of file / pasted text / existing document) runs in the background, one pending request per risk (partial unique index). The AI gets the risk, its current verified quotes, the action and the new evidence (untrusted block). Quotes are verified against the new document. The outcome is stored as a `reassessment` assessment; on failure only the request is marked failed.
- Server outcome rules (`lib/reassessment-rules.ts`) only move an outcome away from "resolved", never towards it: unrelated → unresolved; plan/promise → unresolved; policy or mixed → partially resolved; gaps listed → partially resolved; no verified quote, any unfound quote, or confidence < 0.6 → needs human review. The AI's own outcome is kept in `aiVerdict` and each change is explained in `guardrailNotes`.
- A human decision on a recommendation (accept/reject, once, with name) is stored on the assessment and is separate from closing the risk.
- Evidence documents for reassessment are capped at 100,000 characters (sent in one request) and stored with `purpose = evidence`.
- Company rules (playbook): one row in `playbooks` (`GET/POST/DELETE /api/playbook`, upload replaces, max 40,000 chars because it is sent with every section). Snapshotted at analysis start (`analysis_runs.playbookTitle`) and sent in an untrusted `<company_rules>` block. The cited rule (`playbookRuleQuote`) is verified against the rules text like any quote; not found → `playbookRuleVerified=false` + review reason. Risks store a copy of the rule, so replacing/removing rules does not change history. Documents checked earlier need "Check again" to use new rules.
- Compliance score (`lib/compliance-score.ts`, one source for the constants): 100 minus 18/12/7/2 per Critical/High/Medium/Low risk, floor 0. Closed and `unverified` (quote not found) risks are not counted; `no_evidence` (missing clause) risks are. Null until analyzed. List uses a SQL subquery; document detail returns the breakdown and overrides the score from the same rows.
- `regulations` (GDPR, ISO 27001, ISO 9001, SOC 2, HIPAA, NIST, Local law, Azerbaijan law; max 3 from the AI, union ≤5 after merge) are "related areas to check", never violations. `suggestedClause` is a draft (UI: "Draft — have a lawyer review"), dropped by the server when the final severity is Low.

## Product

- Phase 1 (done): data model, dashboard, documents (add by pasted text, view, delete), risk register and risk detail views, live system status (API / DB / AI provider).
- Phase 2 (done): PDF/DOCX/TXT upload with text extraction, AI risk analysis with verified evidence, progress and errors in the UI.
- Phase 3 (done): evidence verification detail (match type, normalizations, ambiguity, basis, review reasons), filterable risk register, source document on risk detail, stable ids and preserved history across re-analysis.
- Phase 4 (done): mitigation action management, reassessment against new evidence with a before/after comparison view, human decisions and approval-gated closing.
- Auditor additions (done): company rules page, compliance score, related standards, draft replacement clauses (UI, API and PDF report).

## User preferences

- Hackathon MVP: two people, one computer, under a day. Keep architecture simple; working functionality over polish.
- Never fabricate analysis results, API responses or success messages; no hardcoded secrets.
- Use ECC skills only when installed and applicable; don't add an ORM just because a skill suggests it.

## Gotchas

- `lib/api-client-react/tsconfig.json` needs `dom.iterable` in `lib` or codegen's typecheck fails on `Headers.entries()`.
- Keep OpenAPI calendar dates as plain strings (no `format: date`) — Orval otherwise emits `z.coerce.date()` and shifts them to ISO datetimes.
- JSON body limit is 5 MB (large documents are sent as text).
- Drizzle renders columns unqualified in single-table selects, so correlated `sql` subqueries must use explicit table-qualified names (`"documents"."id"`), not `${table.col}`.
- `lib/api-zod/tsconfig.json` needs `dom` in `lib` because multipart schemas use `Blob`.
- Orval generates boolean query params as `z.coerce.boolean()`, which reads "false" as true; parse them explicitly in the route (see `reviewRequired` in routes/risks.ts).
- Orval generates `allOf` schemas (e.g. RiskDetail, DocumentDetail) as `.and()` intersections, so they have no `.shape`.
- Status/severity/evidence enums are defined twice (Drizzle constants and OpenAPI); `tests/evidence-verification.test.ts` fails if they drift. The frontend derives its lists from the generated enums.
- Reassessment and analysis share the mocked `requestStructuredCompletion`; tests distinguish them by `schemaName` (`risk_analysis` / `risk_reassessment`).
- API tests mock only `requestStructuredCompletion`; test fixtures in `artifacts/api-server/tests/fixtures/` contain unique text so duplicate detection never collides with real documents.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
