# H4R Persistent Owner Assistant / Optional Ferocity Adapter

UPDATE: the protected received-payment adapter now requires contract v2. Exact request/response, enrollment/return-link proof flow, digest/version retry rules, and QA status are in C:/Users/schem/Documents/Codex/2026-07-05/homes4rent-netlify-oauth-check-it-out/outputs/h4r-ferocity-protected-payment-contract-v2.md. The earlier local coordinator helper must be aligned to v2 before release. Nothing in this update is deployed.

H4R remains the authority. Local source is prepared; do not deploy either frontend or backend without owner authorization.

Canonical implementation report:
C:/Users/schem/Documents/Codex/2026-07-05/homes4rent-netlify-oauth-check-it-out/outputs/h4r-persistent-owner-assistant-2026-10-15.md

Ferocity 3's advice was incorporated: narrow explicit rental-payment routing, active mappings only, generateJsonWithAiService, immutable H4R previews and source versions, recovery and re-preview, verified after-state receipts, transactional local result persistence and thread ordering. No Ferocity balance table or direct H4R accounting write was added.

The optional bridge now requires an explicit H4R-approved account link, not email equality. Ferocity signs a five-minute pairing challenge identifying its server-session workspace/user; the user approves it while authenticated to the intended H4R workspace. H4R binds that identity to its real authenticated user and checks it per action. Connect provides revocation. Pairing and new endpoint deployment still require QA and release authorization.

H4R-native capabilities: persistent conversations, recoverable confirmations, current balance/payment reads, saved promise-status review, exact before/after settings proposals, received-payment posting, stable explicit preference memory. H4R stores transcripts and proposals; financial truth is reread, never inferred from remembered chat.

New H4R migrations are pending locally: 202610151400, 202610151410, 202610151420. See the full report for paths and acceptance checks. Production settings auditing installed in the preceding turn is separate from this undeployed follow-up.
