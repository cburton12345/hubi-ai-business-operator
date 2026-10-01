<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ferocity agent rules

Read `docs/FEROCITY_AGENT_HANDOFF.md` before substantial work. It is the compact project map; follow its links only when the task needs that detail.

- Preserve the user's work. This repository can be heavily dirty; never reset, discard, overwrite, or mass-format unrelated changes.
- Ferocity is a multi-tenant AI business operating system, not a generic chatbot, marketing agency, or contractor-only product. Native AI and outside agents operate through Ferocity's shared business context, permissions, action layer, audit trail, and approval boundaries.
- Extend existing business actions, capability registries, provider adapters, workflows, and tables. Do not create parallel concepts without first proving the existing system cannot be extended.
- Keep tenant/workspace authorization, RLS, encrypted credentials, idempotency, audit evidence, retry safety, and truthful capability states intact.
- Normal customers use provider OAuth/account selection. Ferocity owns developer apps and platform secrets; never ask customers for developer keys unless a provider truly requires tenant-owned credentials.
- Read first; writes, public communications, spending, billing, destructive actions, sensitive decisions, and uncertain actions remain approval-gated. Never imply an unverified provider or workflow is live.
- Provider costs are tracked separately and passed through/marked up according to policy. Do not silently absorb third-party usage costs.
- Do not deploy the frontend unless the owner explicitly says the exact words `do front end deploy`. A request to test, finish, continue, or prepare is not deployment authorization.
- Before any release, run `npm run predeploy:local`. Fix relevant failures; do not weaken gates to make them pass.
- Prefer focused reads and targeted tests while developing. Batch genuine owner decisions instead of repeatedly asking about routine, reversible implementation steps.
- Never place passwords, API keys, OAuth tokens, recovery codes, card data, or customer secrets in committed files. See the handoff's secure configuration section.
