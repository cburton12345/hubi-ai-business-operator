# Ferocity agent-agnostic business action layer

Date: 2026-09-20

## Product decision

Ferocity is the company brain, system of record, permissions layer, workflow engine, orchestration layer, and owner command center. Its native AI Workforce works out of the box. Approved outside AI workers may later connect to the same controlled business actions.

The strategy is not to beat every general-purpose model at being a general-purpose model. The strategy is to make capable workers useful and safe inside a real business.

Potential positioning, once the connection experience is real and certified:

- Your business. One operating system. Any approved AI workforce.
- Bring the AI team you already have.
- Ferocity gives AI workers the context and tools to operate your business under your rules.

Do not name or claim compatibility with a specific outside agent product until its supported integration path, authentication, permissions, approval behavior, and production use have been tested.

## Reconciled strategy

The three strategy passes are one initiative:

1. Ferocity is an AI operating system, not a collection of disconnected utilities.
2. Ferocity includes a native AI Workforce that can plan and perform governed work from shared business context.
3. Ferocity is agent-agnostic. Approved outside workers can eventually use the same controlled actions without becoming the system of record.
4. Ferocity keeps business rules, proprietary prompts, algorithms, source code, schema, credentials, tenant boundaries, approvals, and orchestration server-side.
5. Better outside models improve Ferocity because the workers remain replaceable while Ferocity retains the business operating layer.

## What was added

`src/lib/business-actions/catalog.ts` is the provider-neutral contract. It currently defines:

- `getOpenLeads()`
- `getStaleLeads()`
- `getUnsoldEstimates()`
- `getCustomerHistory()`
- `getScheduleAvailability()`
- `getJobStatus()`
- `createFollowUp()`
- `updateJob()`
- `scheduleJob()`
- `requestApproval()`
- `getOutstandingInvoices()`

`src/lib/business-actions/gateway.ts` is the server-only data and action layer. It:

- requires a tenant-bound principal;
- checks a named scope for every action;
- validates action input;
- minimizes returned data;
- tenant-scopes every query and mutation;
- records calls in the existing capability execution audit system;
- performs the low-risk, reversible `createFollowUp` action;
- routes job changes, scheduling, and arbitrary consequential proposals into the existing owner approval surface;
- uses idempotency keys to avoid duplicate action requests.
- rejects unauthenticated principals;
- rejects outside agents without a stored, revocable grant;
- rejects every outside-agent action until that individual action is explicitly certified for external use.

The native Follow-Up Agent now uses this same action layer to find stale leads and prepare follow-up work. This is the first proof that the contract is not merely a future external API facade.

## MCP readiness

The core is suitable for an MCP or equivalent interface because tools are named, structured, tenant-scoped, independently authorized, and separated from model-provider code. The current build intentionally does **not** publish an MCP endpoint.

The confirmed Grok connection shape is:

`Grok Bot → Ferocity MCP adapter → Ferocity business-action gateway → existing Ferocity domain services and data`

The bot never connects directly to the database. “Bring your Grok Bot” means the customer authorizes Ferocity as a connector/tool source inside their Grok environment. It does not mean Ferocity imports, enumerates, owns, messages, or controls the customer’s bot roster.

Current official xAI documentation confirms that Grok supports custom remote MCP connectors and that the server controls its own authentication and tool definitions. It also documents shared Bot templates as recipient-owned copies that do not transfer credentials, computer state, or conversation history. Template distribution can therefore remain a future onboarding option, but it is not part of the current implementation.

Before a remote agent endpoint is enabled, Ferocity still needs:

1. OAuth 2.1 or an equivalent tenant-admin connection flow for outside agent principals.
2. Per-principal grants instead of accepting caller-supplied scopes.
3. Short-lived tokens, rotation, revocation, and credential compromise handling.
4. Per-principal and per-action rate limits and spend limits.
5. Explicit read-only versus consequential tool annotations.
6. Approval continuation so an outside worker can request approval and later receive the approved result without bypassing the owner.
7. Output redaction and field-level minimization appropriate to the principal.
8. Injection-resistant tool descriptions and untrusted-content handling.
9. Production certification for each client/provider combination.
10. Owner UI showing connected agents, scopes, recent actions, failures, cost, pause, and revoke.

## Existing domain systems to reuse

| Domain | Existing Ferocity authority | Clean gateway direction |
| --- | --- | --- |
| Customers | `service-ops/get-customer-detail.ts`, customer touchpoints and canonical customer tables | Extract minimized search/get/history DTOs; do not expose raw customer rows. |
| Leads | Lead dashboard/detail, lead intelligence and Lead Command | Reuse current qualification, scoring and follow-up rules behind read and governed-write actions. |
| Estimates | Estimator, public estimate and service estimate systems | Expose read DTOs first; route repricing, sends and follow-up through current approval/execution paths. |
| Jobs | Job Tracker, Service Ops and Construction Job Health | Reuse canonical job and risk logic; never create a second job representation for agents. |
| Scheduling | Schedule dashboard, service visits and `evaluate-visit.ts` | Return availability/conflicts; schedule mutations remain approval- and conflict-gated. |
| Communications | Messaging Engine, conversation history and Office Manager actions | Draft internally; use the guarded outbound queue for every send or call. |
| Money | Service Ops money, cash collection, invoices and job-costing | Return minimized balances/financial summaries; keep payments, refunds and accounting changes highly restricted. |
| People | Operations Workforce, employee workday and Labor Bench | Return role-appropriate capacity; protect payroll, private employee data and location history. |
| Marketing | Marketing OS, Growth Distribution and attribution | Reuse brand voice, opportunity, approval, publishing and performance-learning systems. |

The next action contracts should be added only when their existing domain logic has been extracted into a reusable server-side service. The executable catalog should not contain decorative tools that bypass or duplicate those systems.

## Recommended MCP shape

An eventual MCP server should be a thin adapter over `invokeBusinessAction`, not a second implementation of CRM, scheduling, billing, or approvals. Authentication maps the remote identity to a stored Ferocity principal and stored grants. The adapter supplies that principal to the gateway; it never trusts tenant IDs or scopes supplied by the model.

Read tools can be exposed selectively. Consequential tools should return a prepared approval request unless the workspace has a specific, applicable automation policy. Ferocity remains authoritative for approvals even if a connected model supports its own approval flags.

Tool results must return task-sized DTOs only. The MCP adapter must never expose source code, proprietary prompts, internal algorithms, database credentials, raw schema, cross-tenant data, provider secrets, or business logic that the worker does not need. Untrusted document, webpage, email, and customer content remains data—not instructions that can widen the agent’s permissions.

Official references used for this decision:

- https://docs.x.ai/grok/connectors
- https://docs.x.ai/developers/tools/remote-mcp
- https://docs.x.ai/grok-bot/bots
- https://docs.x.ai/grok-bot/approvals-security-and-privacy

## Current truth

- Native Ferocity workforce: implemented and active behind the runtime contract.
- Provider-neutral business action catalog: implemented.
- Native use of the action catalog: implemented for stale-lead follow-up.
- Outside-agent principal authentication: not implemented.
- Public API/MCP endpoint: not exposed.
- Named Grok, OpenAI, or other outside-agent compatibility: not certified and must not be claimed publicly.

This separation lets Ferocity add a remote MCP server or another agent protocol without rebuilding business logic or surrendering system-of-record authority.
