---
name: Veriscope stack and delivery decisions
description: Why Postgres+Drizzle (not SQLite+Prisma), which ECC skills are installed, and how the user delivers work in phases.
---
- Database: Replit Postgres + Drizzle, kept from the template. The user asked for "SQLite + Prisma if it fits"; it didn't fit.
  **Why:** the project already had Drizzle wired up. The user said to inspect existing layers and avoid unnecessary rewrites. A SQLite file in a published Replit app resets on every redeploy.
  **How to apply:** don't add Prisma or SQLite. The user's rule: use `prisma-patterns` only if Prisma is actually selected; otherwise use the matching database skill (currently `postgres-patterns`).
- Exactly 10 ECC skills (affaan-m/ECC) live in `.agents/skills/` by the user's choice. ECC has no `database-design` or `code-review` skill; `coding-standards` stands in for code review.
- The user sends work as numbered phase briefs (attached .txt). Stay within each phase's scope; they want verified results reported (files changed, commands run, actual test output, blockers) and nothing fabricated.
