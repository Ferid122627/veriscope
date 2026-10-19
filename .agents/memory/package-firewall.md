---
name: Replit package firewall blocks CVE versions
description: Why pnpm install can fail with ERR_PNPM_FETCH_403 and how it was handled (pnpm override to the patched version).
---
- Replit's package firewall (Socket) returns 403 "Blocked by Security Policy. Reason: Critical CVE" for vulnerable versions, so `pnpm install --frozen-lockfile` fails on a fresh environment even though the lockfile is valid.
- Fix used: add a pnpm `overrides` entry in pnpm-workspace.yaml pinning the patched release (proxy-addr ^2.0.8, needed by Express), then a normal `pnpm install` to update the lockfile.
  **Why:** the blocked version cannot be downloaded at all; an override is the smallest change and keeps every other version unchanged.
  **How to apply:** on a 403 from package-firewall.replit.internal, `curl -i` the tarball URL to read the reason, check the registry for a patched version (and its publish date vs `minimumReleaseAge`), then override.
