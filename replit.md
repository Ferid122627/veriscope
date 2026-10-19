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
- Sample documents for demos: `samples/supplier-agreement.pdf` (3 pages), `samples/continuity-memo.docx`

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
- DB schema: `lib/db/src/schema/` (documents, risks, evidence, assessments, mitigation-actions)
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
- Upload limits: 10 MB file, 400,000 characters of text (rejected, never truncated). Type is checked by magic bytes as well as extension. Image-only PDFs are rejected with an explicit "no OCR" message.
- Analysis runs in-process in the background: `POST /documents/:id/analyze` atomically claims the document (status → analyzing) so double submits get 409; the client polls the document. Documents left "analyzing" by a server restart are marked failed on startup.
- Long text is split into ~24k-char overlapping sections (3 in parallel); duplicate risks across sections are merged by title. Progress = chunksDone/chunksTotal.
- Document text is passed to the model only inside a `<document>` block declared as untrusted data.
- Each AI risk is saved with its evidence quotes (located in the stored text → verified + offsets + PDF page, otherwise unverified), one mitigation action, and one `initial` assessment, in a single transaction. Re-analysis needs `replaceExisting: true` and replaces old risks only if the new run succeeds.
- Deleting a document cascades to its risks, evidence, actions and assessments.

## Product

- Phase 1 (done): data model, dashboard, documents (add by pasted text, view, delete), risk register and risk detail views, live system status (API / DB / AI provider).
- Phase 2 (done): PDF/DOCX/TXT upload with text extraction, AI risk analysis with verified evidence, progress and errors in the UI.
- Later phases: mitigation action management, reassessment with new evidence.

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
- API tests mock only `requestStructuredCompletion`; test fixtures in `artifacts/api-server/tests/fixtures/` contain unique text so duplicate detection never collides with real documents.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
