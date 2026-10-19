---
name: Veriscope UI design direction
description: Approved visual direction, wording and token conventions for the web app, to keep later UI work consistent
---
- Audience is non-technical business users. Interface copy is plain language: "Check a document", "Risks to fix", "Why it matters", "Text found in your document", "What to do next", "Check again", "Needs your review", "Being fixed" (for the `mitigating` status). Internal names (reassessment, register, mitigating) stay only in code identifiers and routes.
- Palette: navy sidebar #111C32, text #17243A, teal primary #087F8C (also `--accent` and `--ring`), light teal #5ED6C0 only on the navy sidebar (never small text on white), background #F5F7FA, borders #E3E8EF, secondary text #697586. Orange/red/amber stay reserved for priority and review warnings.
- Sans (Geist) everywhere, sentence-case labels, no mono/uppercase eyebrows. Quotations and document text use `.font-quote` (Newsreader) so exact source text stands apart.
- Secondary detail (analytics, history, how it works) goes in the native-`<details>` Disclosure from the kit; primary tasks stay visible.
- The risk-detail closure steps are derived only from recorded data; never fake progress.

**Why:** the user asked for an everyday-business redesign: restrained, no gradients/neon/heavy shadows, no invented metrics, and a clear split between AI suggestion and human decision.
**How to apply:** reuse tokens and kit components (PageHeader description, BackLink, Disclosure, Panel subtitle); do not add a second palette or decorative AI styling.

## Two audiences
- Normal users (role `user`) get a separate simplified UI; company users keep the full workspace. Do not add technical concepts (scores, evidence status, reassessment, R-codes) to the simple view.
**Why:** the user said first-time normal users could not understand anything in the full UI, and asked to keep the company UI as is. UI language stays English (user's choice).
**How to apply:** new features need a decision per audience; default to company-only unless it is plainly useful to a first-time user.
