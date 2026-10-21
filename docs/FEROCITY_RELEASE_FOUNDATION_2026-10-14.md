# Ferocity release foundation — migrations 250–252

## Scope and current boundary

This tranche certifies the document-email queue, integration authority receipts, and external-AI MCP credential layer before any release. It does not authorize or perform a database migration, Netlify deploy, DNS change, provider write, or production-data test.

Connected files:

- `supabase/migrations/250_document_email_ingestion_jobs.sql`
- `supabase/migrations/251_integration_authority_receipts.sql`
- `supabase/migrations/252_external_ai_mcp_credentials.sql`
- `scripts/release-foundation-db-certification.mjs`
- `scripts/release-foundation-env-check.mjs`
- `scripts/release-foundation-manifest.mjs`
- `scripts/release-foundation-preview-smoke.mjs`
- `netlify/functions/process-document-email-background.ts`
- `netlify/functions/run-document-email-recovery.ts`
- `netlify/functions/mcp.ts`

## Migration review

### 250 — document email ingestion jobs

Depends on migration 249's `document_intelligence_import_batches`, core `tenants`, and `has_tenant_role(uuid,text[])`. The queue uses per-attachment idempotency, a 15 MiB limit, independent status/retry state, tenant RLS, and a due-work partial index. Preflight rejects an untracked pre-existing table so `IF NOT EXISTS` cannot silently preserve schema drift.

### 251 — integration authority receipts

Adds logical customer authority independently of provider OAuth scopes. Existing `integration_connections` records are counted read-only before migration; they are not automatically converted into write, publish, spend, communication, or money-movement consent. Owner/admin RLS and browser grants remain narrower than service-role execution.

### 252 — external AI MCP credentials

Stores only SHA-256 token hashes and display prefixes. Credentials require a tenant, active authorized user, nonempty scopes, explicit versioned consent, expiration/revocation state, and unique hashes. Invocation records retain tenant, credential, tool, input hash, result state, provenance, idempotency, and durable job references. Postflight rejects plaintext token-like columns, missing RLS/policies, empty consent/scopes, and orphaned tenant records.

## Exact release sequence

1. Generate an evidence manifest: `npm run release:foundation:manifest`.
2. Run read-only database preflight: `npm run release:foundation:preflight`.
3. Validate every pending migration in a rolled-back transaction: `npm run db:validate:migrations`.
4. Verify environment key presence without printing values: `npm run release:foundation:env` locally. For an exported Netlify key-name-only JSON inventory, use `node scripts/release-foundation-env-check.mjs --keys-file=<path>`.
5. Run the complete local release gate: `npm run predeploy:local`.
6. Stop and obtain explicit deployment/migration authorization.
7. Apply migrations through the normal transactional runner. Do not hand-edit production tables.
8. Run `npm run release:foundation:postflight` immediately.
9. Build the immutable Netlify preview through the normal Git/adapter path.
10. Run `FEROCITY_PREVIEW_BASE_URL=<immutable-preview-url> npm run release:foundation:preview`. The smoke refuses production hosts and uses no credential or mutation.
11. Only after preview evidence passes, obtain any separately required production-deploy authorization and promote the exact preview artifact.

## Recovery and partial-failure procedure

### Migration failure

- Stop the runner. Each migration is transaction-wrapped, so the failing file rolls back; earlier files may already be committed.
- Run preflight. A partial 250–252 ledger state is an intentional hard failure, not permission to delete tables or migration rows.
- Inspect the failing migration and production catalog. Preserve completed queues, authority receipts, credentials, and invocation evidence.
- Fix forward with a new additive migration when a committed schema needs correction. Never edit a committed migration or manufacture a ledger entry.
- Re-run rolled-back validation, the migration runner, postflight, RLS verification, and the full release gate.

### Function/build failure

- A failed Netlify deploy does not replace the published artifact. Keep the current production release.
- Correct the source/configuration and create a new preview; do not manually upload `.next` or bypass the Next.js adapter.
- If a bad artifact was published, disable only the affected lane where possible, fix forward, rebuild, recertify, and deploy the corrected artifact. Preserve audit evidence.
- For MCP exposure, revoke affected external-AI credentials before resuming the endpoint. Never rotate by storing or logging plaintext tokens.
- For document ingestion, leave durable jobs intact; recover with the bounded recovery worker after the function is healthy.

## Final release gate

Release is blocked unless all are true:

- The manifest identifies the exact commit plus every tracked/untracked source change.
- Preflight reports either all three migrations absent with clean dependencies/no drift, or all three present with postflight invariants passing.
- Pending migrations validate in a rollback transaction.
- Required runtime keys are present in the intended Netlify context; no value appears in logs or artifacts.
- Tests, worker checks, typecheck, lint, production build, document artifact readiness, RLS verification, and security/provider/capability/UI guards pass.
- Preview smoke passes onboarding guards, document-ingestion authorization, MCP method/auth/host handling, and public health.
- The exact reviewed preview artifact is the artifact proposed for production.
- No migration, deployment, DNS change, provider write, spending, or real customer-data test occurs without its required authorization.

## Post-release certification queries

`npm run release:foundation:postflight` is the authoritative executable check. It verifies ledger completeness, table presence, RLS, named policies, safe credential columns, nonempty consent/scopes, active tenant membership, invocation/credential tenant alignment, and email-job/batch tenant alignment. It runs inside a read-only transaction and persists nothing.
