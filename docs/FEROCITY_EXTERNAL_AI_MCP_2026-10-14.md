# Ferocity external AI MCP integration

Date: October 14, 2026
Status: source-ready, not migrated, not deployed, no Muse connectivity claim

## Architecture and endpoint

The MCP server is a thin adapter over Ferocity's existing provider-neutral business-action gateway, operating-goal engine, commitment records, approval policies, capability audit trail, and tenant-scoped PostgreSQL services. External assistants never receive database credentials, service-role keys, raw schema access, generic SQL, provider secrets, proprietary prompts, or unrestricted write tools.

Source endpoint: Netlify Function `netlify/functions/mcp.ts`, mounted at `/mcp`.
Proposed production endpoint after approval: `https://api.ferocity.live/mcp`.
Transport: MCP Streamable HTTP over HTTPS, stateless request handling, JSON responses.
SDK: `@modelcontextprotocol/sdk` 1.32.1.
Supported and locally negotiated versions: `2025-11-25`, `2025-06-18`, and `2025-03-26`.

The endpoint supports `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`. Data-list tools use stable opaque UUID cursors. All synchronous tool work is terminated at 42 seconds, below the 45-second client boundary. Workflow starts persist a Ferocity operating goal and immediately return a durable invocation/job ID; clients poll with `get_job_status`.

## Tool catalog

| MCP tool | Required scope | Behavior |
| --- | --- | --- |
| `get_business_summary` | `business:read` | Minimized workspace identity and aggregate operating counts. |
| `list_customers` | `customers:read` | Paginated customer identifiers, names, types, and status; no phone/email secrets. |
| `get_customer` | `customers:read` | Minimized customer, job, estimate, invoice, and follow-up history. |
| `list_jobs` | `jobs:read` | Paginated jobs, customer name, schedule, status, and timestamps. |
| `list_invoices` | `invoices:read` | Paginated totals, paid amount, balance, status, and due date; no payment credentials. |
| `list_tasks` | `commitments:read` | Paginated durable operating commitments. |
| `get_job_status` | `workflows:read` | Poll an invocation owned by the same tenant and credential. |
| `create_task` | `commitments:write` | Idempotently creates a reversible internal commitment. It does not communicate externally or spend money. |
| `update_task` | `commitments:write` | Idempotently updates a task; completing it requires evidence. Cancellation is supported. |
| `start_workflow` | `workflows:write` | Idempotently creates/resumes an operating goal in `observe` or `prepare` mode only. Existing approvals govern execution. |

Tool discovery is credential-scoped: clients do not see tools their stored grant cannot use. Every tool has a validated Zod-generated JSON Schema, structured output, stable identifiers, timestamps, provenance, and a durable invocation record.

Every returned tool payload also passes through a shared external-output policy. It removes credential, token, authorization, database, private-prompt, source-code, raw-query, reasoning-trace, and proprietary-workflow fields; redacts secret-shaped values found under otherwise harmless keys; caps arrays at 25 records, strings at 6,000 characters, and recursion at eight levels. When information is redacted or truncated, `_ferocityOutputPolicy` says so and identifies truncated paths without revealing the protected material. External list tools accept no more than 25 rows per call and require cursor pagination. These controls reduce accidental disclosure and bulk enumeration without replacing the customer's responsibility to review the external provider's own data policy.

## Authentication, isolation, and authorization

Migration `252_external_ai_mcp_credentials.sql` adds:

- `external_ai_credentials`: tenant/user-bound grants, SHA-256 token hashes, display-only prefixes, explicit scopes, expiration, rotation lineage, revocation, and last-use evidence.
- `external_ai_tool_invocations`: tenant/credential-bound audit, idempotency, status, retry, durable reference, output summary, and error evidence.

Each credential also carries owner-configurable daily request and returned-record ceilings. Every call checks the durable daily totals before execution. A high five-minute burst creates a deduplicated owner-attention event; reaching either daily ceiling rejects further work safely. Invocation records store only a minimized output summary and returned-record count, never the full external payload.

Tokens use a cryptographically random `fer_mcp_...` value. Ferocity stores only its SHA-256 hash and shows the plaintext once. Authentication revalidates that the tenant is active/trial and the authorizing user remains an active member. Revoked, expired, inactive-workspace, and removed-user grants fail before MCP protocol handling. Every business query includes the tenant ID from the stored credential; caller-supplied tenant IDs are discarded by schema validation.

External AI is opt-in and is not an onboarding completion requirement. Ferocity's native AI remains available without any external credential. Creating a new credential requires an owner/admin to acknowledge a versioned consent statement describing the selected provider, scoped data exchange, provider-controlled processing, and Ferocity's protected internal boundary. Migration 252 persists the consent version, timestamp, and exact summary with the credential. Rotation preserves the original receipt; expanding scopes requires a separately created credential and fresh acknowledgement.

Mutation idempotency keys are mandatory. Reuse with different input is rejected. Identical completed requests replay the stored result; a failed, timed-out, or stale run may safely retry with the same input. Consequential financial, legal, external-communication, publishing, advertising/spend, destructive, and uncertain actions are not present in this initial tool set and cannot bypass Ferocity approval policy through `start_workflow`.

## Credential operations

Only an active Ferocity workspace owner/admin may create, rotate, or revoke a credential. The authorized user must remain an active workspace member.

After migration 252 is deliberately applied, owners/admins can manage credentials at `/app/integrations/external-ai`. The page creates scoped, expiring Muse or generic MCP credentials, displays plaintext only once, and supports atomic rotation and revocation. Operators and viewers are denied. Tokens are never written to browser storage.

The customer flow now explicitly starts with the no-action choice: Ferocity native AI remains the default. Owners who opt in select Muse or a generic MCP assistant, review human-readable read/write boundaries, set daily ceilings, acknowledge consent, receive assistant-specific setup steps, and run a harmless `get_business_summary` test through the same bearer authentication and MCP tool path. Existing-connection cards show scopes, expiration, revocation state, today's calls/records, last call, and failure health. Creation, rotation, revocation, and abnormal-use events appear in the owner command stream without the token.

`/.well-known/oauth-protected-resource` publishes the resource URL, supported scopes, bearer-header method, and an explicit `planned_authorization_code_pkce` status. It intentionally advertises no authorization server yet. Customer-facing authorization-code + PKCE remains a planned follow-up; the metadata must not be interpreted as a live OAuth claim.

After migration 252 is deliberately applied to the identified environment:

```powershell
npm run mcp:credential -- create --tenant WORKSPACE_SLUG --user OWNER_EMAIL --provider muse --label "Muse" --scopes "business:read,customers:read,jobs:read,invoices:read,commitments:read,commitments:write,workflows:read,workflows:write" --days 90
npm run mcp:credential -- list --tenant WORKSPACE_SLUG --user OWNER_EMAIL
npm run mcp:credential -- rotate --tenant WORKSPACE_SLUG --user OWNER_EMAIL --credential CREDENTIAL_UUID --provider muse --label "Muse rotated" --scopes "business:read,customers:read,jobs:read,invoices:read,commitments:read,commitments:write,workflows:read,workflows:write" --days 90
npm run mcp:credential -- revoke --tenant WORKSPACE_SLUG --user OWNER_EMAIL --credential CREDENTIAL_UUID
```

Creation/rotation prints the plaintext token once to the authorized local operator. Do not copy it into source, logs, chat, public files, or browser storage. Put it directly into the approved client's encrypted credential store. Rotation creates a new token and revokes the old token atomically.

## Environment and hosting

Required existing variables:

- `DATABASE_URL`
- `DATABASE_CA_CERT_BASE64` in production when a verified CA is configured
- `DATABASE_POOL_MAX`

New configuration:

- `MCP_ALLOWED_HOSTS=api.ferocity.live,ferocity.live` — exact request-host allowlist for DNS-rebinding defense.

No Supabase service-role key is exposed or required by the MCP client.

Proposed DNS after deployment authorization:

1. Add `api.ferocity.live` as a custom domain/alias for the existing Netlify site.
2. Create the DNS record Netlify supplies (normally a CNAME for `api`).
3. Wait for Netlify-managed TLS to become active.
4. Keep `/mcp` POST-only; do not redirect it through an HTML route.
5. Verify the exact Host header is in `MCP_ALLOWED_HOSTS`.

No DNS or production configuration was changed in this tranche.

## Local verification

Automated coverage includes:

- initialization and exact negotiation for all three requested protocol versions;
- initialized notification;
- ten-tool discovery and schemas;
- harmless `get_business_summary` call;
- missing/invalid/revoked/expired credential rejection contract;
- active-user and active-tenant credential requirements;
- organization isolation and rejection of caller-supplied tenant IDs;
- scope-filtered discovery and unauthorized-tool rejection;
- mandatory mutation idempotency and replay behavior;
- malformed JSON-RPC/unknown method and unsupported HTTP method behavior;
- 42-second durable timeout behavior;
- migration validation and RLS policy presence.

The local tests use production-shaped records and mocked database boundaries; they do not use production customer data. A real Muse connection is **not** verified because migration 252 is not applied, the endpoint is not deployed, DNS is unchanged, and no live credential exists.

Final local evidence: the complete `npm run predeploy:local` gate passed with 255 Vitest files / 990 tests, seven Marketplace worker tests, repository TypeScript, full ESLint, all public/provider/capability/UI/integration guards, migrations 250–252 validated without persistence, the optimized 123-page Next.js 16.4.1 build, and document-runtime artifact verification. A standalone bundled Netlify MCP function also imported and enforced its request-host guard successfully.

The prior production dependency advisories were resolved locally by upgrading Next.js to 16.4.1 and pinning the patched `sharp` 0.35.5 and `source-map-js` 1.2.2 dependency versions. `npm audit --omit=dev` reports zero production vulnerabilities, and the complete release gate passed after the upgrade.

After the guided connection, quota, anomaly, lifecycle, health, and discovery-metadata additions, the complete combined-tree predeploy gate passed again: 258 Vitest files / 1,014 tests, seven Marketplace worker tests, TypeScript, full ESLint, all public/provider/capability/UI/integration guards, rollback validation for migrations 250–252, the optimized 123-page build, and document-runtime artifact verification.

## Deployment and live-validation checklist

1. Reconfirm that the configured Supabase project reference is the canonical production project (`puvpgebitzvyqbdnnlyz`) immediately before release.
2. Review and deliberately apply pending migrations 250–252 to that project as one production change; none has been applied during this work.
3. Set `MCP_ALLOWED_HOSTS` in the intended Netlify context.
4. Run the complete `npm run predeploy:local` release gate.
5. Re-run `npm audit --omit=dev` and require zero production vulnerabilities before release.
6. Create a deploy preview and verify `/mcp` is POST-only, rate-limited, no-store, and rejects bad hosts/tokens.
7. Create a short-lived read-only Muse credential with only `business:read`.
8. From Muse, complete a real authenticated `initialize`, `notifications/initialized`, `tools/list`, and `get_business_summary` call.
9. Verify the returned tenant is correct and the invocation appears in Ferocity's audit records.
10. Revoke the credential and prove the same token immediately returns 401.
11. Only then add `api.ferocity.live`, repeat TLS/host validation, and consider a narrowly scoped mutation certification.
12. Do not claim Muse compatibility until step 8 succeeds with the real client and step 10 proves revocation.

## Known limitations and Muse-spec differences

- The initial customer connection uses owner/admin-created scoped Bearer credentials through Ferocity's self-service integration page. OAuth 2.0 authorization-code + PKCE, protected-resource metadata, dynamic client registration policy, consent UI, and token refresh are the next customer-facing authentication phase.
- Ferocity is intentionally stateless at the MCP transport layer. Durable work state is stored in Ferocity's database, and Muse can poll `get_job_status`; no inbound Muse webhook is required.
- The initial catalog has no arbitrary workflow cancellation tool. Internal tasks can be canceled through `update_task`; operating goals remain cancelable through Ferocity's existing governed owner controls.
- Tools are paginated at the business-data level. The ten-item `tools/list` catalog itself does not require pagination.
- Client-specific behavior beyond the official MCP protocol cannot be certified until Muse performs the live handshake.

Official implementation references:

- MCP TypeScript SDK: https://www.npmjs.com/package/@modelcontextprotocol/sdk
- SDK protocol versions: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md
- Streamable HTTP specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/draft/basic/transports/streamable-http.mdx
