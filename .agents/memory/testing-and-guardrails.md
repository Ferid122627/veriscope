---
name: Testing DB and AI guardrail design
description: Isolated test DB, read-skew caveat, and how AI support/conflict fields are validated
---
- Run API tests against the separate `veriscope_test` DB (rewrite DATABASE_URL, unset AI env vars); dev DB `heliumdb` holds demo data.
- `GET /risks/:id` runs parallel queries without a transaction, so reads can straddle a commit (REPEATABLE READ fix proposed, not applied).
- PDF parsing needs Node 24 (`Iterator` helpers); `.replit` pins nodejs-24.
- AI `quoteSupport` / `conflictsWithEvidence` are validated by normalizing to "invalid" (never defaulted to a safe value); server only adds review reasons or downgrades verdicts.
**Why:** a missing model field must never read as "supports" or "no conflict".
