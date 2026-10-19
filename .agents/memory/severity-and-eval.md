---
name: Severity calibration, eval suite and AI rate limit
description: How risk severity is capped server-side, what the eval suite measures, and the unauthenticated-API caveat
---
- The model proposes severity, riskKind (missing_protection / potential_risk / actual_issue) and severityReason; the server only ever lowers severity (missing clause: Medium unless harm likely; Critical only for an explicit, fully verified actual issue; weak evidence or low likelihood: Medium). The explanation is stored with the risk. Older risks have null riskKind/severityReason and were not re-rated.
- Duplicate merging uses a strict title-similarity check (stemmed tokens); wrongly merging two distinct risks hides one, so keep it strict.
- `tests/risk-quality-eval.test.ts` uses a mocked AI: its metrics measure the server pipeline, not real model accuracy. Reassessment resolved/unresolved cases live in `reassessment.test.ts`.
- AI endpoints (analyze, reassessment) have an in-memory per-client and global rate limit (env AI_RATE_LIMIT_*; very high under vitest). There is still no authentication: anyone with the URL can delete data or spend AI budget.

**Why:** the user asked for explainable, non-inflated severity and honest, non-invented metrics.
**How to apply:** keep calibration lower-only; never present mocked-AI metrics as model accuracy; flag auth as required before a public deploy.
