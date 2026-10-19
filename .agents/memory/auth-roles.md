---
name: Login and roles
description: Session auth design, template accounts, what normal vs company users see
---
- Custom signed-cookie auth chosen over Clerk because the user asked for two fixed template users (normal, company). Demo passwords are in the seed and shown on the login page.
- Documents/risks are shared between users (not per-owner); company-rule data is hidden from role `user` by scrubbing responses. Per-user data ownership was not built (too many queries touched).
**Why:** the user asked only that the normal user has no company rules and the company user does.
**How to apply:** if real multi-tenant separation is requested, add an owner column and filter all document/risk/dashboard queries; remove demo passwords before a public deploy.
