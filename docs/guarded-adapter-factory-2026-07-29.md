# Guarded Adapter Factory

Date: July 29, 2026

## Outcome

Customers can request a bring-your-own provider from **Connect Tools → Advanced**. Ferocity saves demand, accepts an official OpenAPI 3 JSON address, prepares a declarative adapter draft, runs automated safety checks, and asks the customer to review the proposed connection.

The factory reduces research and scaffolding work. It does **not** turn arbitrary AI output into production code.

## Workflow

1. A workspace requests a provider and explains the intended use.
2. The request enters a tenant-scoped queue if its plan and monthly adapter-research limit permit it.
3. Ferocity fetches only a direct public HTTPS OpenAPI 3 JSON document.
4. The document is reduced to paths, methods, operation identifiers, and authentication scheme names. Documentation prose is excluded from the AI prompt.
5. AI may select a minimal subset of existing normalized operation identifiers.
6. Ferocity re-pins immutable fields, disables writes, and stores a non-executable manifest.
7. Automated checks must pass before customer review.
8. Customer approval means “send this draft to engineering.” It does not mean “publish.”
9. Engineering must implement and test the provider adapter through the existing connector interfaces.
10. A trusted release path records the deployed commit and release version before the request can become `released`.
11. Ferocity records timeline events and sends workspace notifications when review is ready and when the tested adapter is released.

## Safeguards implemented

- Tenant-scoped requests, builds, events, and review permissions.
- Monthly plan limits before paid AI research starts.
- No API keys, passwords, or customer credentials during research.
- HTTPS only; embedded credentials, custom ports, localhost, private IP ranges, and restricted IP ranges are rejected.
- DNS is resolved and the outbound TLS connection is pinned to the validated public address to reduce DNS-rebinding risk.
- Redirects are not followed.
- JSON only, OpenAPI 3.x only, 1 MB maximum, 10-second timeout.
- Documentation prose is stripped before AI use to reduce prompt-injection risk.
- Maximum 150 normalized operations and 25 selected operations.
- AI cannot invent endpoints: selected operation identifiers are checked against the normalized specification.
- Provider identity, category, origin, authentication, operations, and write-disabled state are re-pinned after AI generation.
- Generated artifacts are declarative and explicitly non-executable.
- All write-capable operations remain disabled.
- Communications, payments, email, advertising, voice, and video are high-risk categories and require engineering review.
- Concurrent workers atomically claim queued builds so the same request is not processed twice.
- Customer review cannot mark a connection available.
- Customer database roles have no insert, update, or delete grants on build or event records.
- Production release requires an approved engineering state, an adapter registered as executable in the runtime registry, a platform administrator, a release version, and a deployment commit SHA.
- Timeline and build-event audit trails preserve status changes and review notes.

## What this intentionally does not do

- Execute generated source code.
- Generate or run database migrations.
- Accept provider credentials before a tested adapter exists.
- Automatically deploy to Netlify or any production environment.
- Turn on provider writes, billing, messaging, calling, publishing, or ad spend.
- Claim an unknown provider works merely because an OpenAPI document was parsed.

## Engineering completion requirement

A provider becomes genuinely usable only after its connector is implemented against Ferocity’s existing provider interfaces, verified with provider-specific tests, registered in connector runtime readiness, and released from an approved build using `markAdapterBuildReleased`.

This preserves the product promise: Ferocity can do much of the repetitive discovery and preparation, while security-sensitive production behavior remains deterministic, tested, reviewable, and reversible.
