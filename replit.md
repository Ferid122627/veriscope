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
- Required env: `DATABASE_URL` (provided by Replit's built-in Postgres)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, pino logging
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
- Deleting a document cascades to its risks, evidence, actions and assessments.

## Product

- Phase 1 (done): data model, dashboard, documents (add by pasted text, view, delete), risk register and risk detail views, live system status (API / DB / AI provider).
- Later phases: file upload + text extraction, AI risk analysis with evidence verification, mitigation action management, reassessment.

## User preferences

- Hackathon MVP: two people, one computer, under a day. Keep architecture simple; working functionality over polish.
- Never fabricate analysis results, API responses or success messages; no hardcoded secrets.
- Use ECC skills only when installed and applicable; don't add an ORM just because a skill suggests it.

## Gotchas

- `lib/api-client-react/tsconfig.json` needs `dom.iterable` in `lib` or codegen's typecheck fails on `Headers.entries()`.
- Keep OpenAPI calendar dates as plain strings (no `format: date`) — Orval otherwise emits `z.coerce.date()` and shifts them to ISO datetimes.
- JSON body limit is 5 MB (large documents are sent as text).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
