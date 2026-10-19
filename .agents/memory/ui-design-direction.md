---
name: Veriscope UI design direction
description: Approved visual direction and token conventions for the web app, to keep later UI work consistent
---
- Palette: navy + white base, teal (`--accent`) as the only highlight colour; orange/red/amber stay reserved for severity and review warnings.
- `font-serif` / `--app-font-serif` now maps to Geist (sans) for headings and figures; source quotations and document text use `.font-quote` (Newsreader italic) so excerpts stand out from UI copy.
- Verified-evidence badges use a teal tint (`bg-accent/10 text-accent`), not solid fills.
- The risk-detail "Path to closure" steps are derived only from recorded data (requests, latest reassessment, human decision, status); never fake progress.

**Why:** the user asked for a restrained enterprise look, no invented metrics, and an explicit split between AI recommendation and human decision.
**How to apply:** reuse tokens and kit components; do not add a second palette or decorative AI styling.
