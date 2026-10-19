---
name: Testing DB and AI guardrail design
description: Isolated test DB, read-skew caveat, and how AI support/conflict fields are validated
---
- Run API tests against the separate `veriscope_test` DB (rewrite DATABASE_URL, unset AI env vars); dev DB `heliumdb` holds demo data.
**Why:** the plain `pnpm test` uses the dev DB and its afterAll hooks delete every playbook row — it once wiped the user's uploaded company rules (re-uploaded from `samples/test-company-rules.pdf`).
- `GET /risks/:id` runs parallel queries without a transaction, so reads can straddle a commit (REPEATABLE READ fix proposed, not applied).
- PDF parsing needs Node 24 (`Iterator` helpers). A fresh GitHub import resets `.replit` to nodejs-20, so reinstall the nodejs-24 module after importing.
- AI `quoteSupport` / `conflictsWithEvidence` are validated by normalizing to "invalid" (never defaulted to a safe value); server only adds review reasons or downgrades verdicts.
**Why:** a missing model field must never read as "supports" or "no conflict".
- The `veriscope_test` DB does not survive a fresh import; recreate it (`create database veriscope_test`) and push the schema to it before running tests.
