# H4R persistent operator foundation — October 7, 2026

Ferocity now has a local, undeployed source path to trigger Homes4Rent's existing business rules as one persistent operator. H4R remains the source of truth.

## Ferocity changes

- `src/lib/integrations/h4r/operator.ts` signs idempotent H4R operator requests, retries only safe failures, reports honest unconfigured/failure state, and requests `observe`, `prepare`, or `execute` from environment configuration.
- `src/lib/automation/run-business-automation.ts` invokes H4R once per leased global automation pass and raises a platform alert when the configured handoff fails.
- `.env.example` and `src/lib/env.ts` define `H4R_OPERATOR_URL` and `H4R_OPERATOR_MODE`; the existing H4R bridge secret signs the request.
- Unit coverage verifies honest unconfigured behavior, HMAC headers/stable run intent, and terminal authorization failure behavior.

## H4R changes

The authoritative H4R snapshot at `C:\Users\schem\OneDrive\Desktop\homes4rent-supabase-functions-2026-07-19` contains the durable run/audit migration, HMAC/replay-protected conductor, generalized owner-attention bridge, and truthful SMS acceptance/send callbacks. Its operational handoff is `FEROCITY_PERSISTENT_OPERATOR_HANDOFF.md` in that snapshot.

## Safety and readiness truth

- No migration was applied and no function or frontend was deployed.
- No external SMS/email was sent and no rent charge, late fee, or owner event was created during development.
- H4R independently caps Ferocity's requested authority mode; a Ferocity request cannot elevate H4R above its configured ceiling.
- `prepare` reuses existing H4R promise, payment-plan, legal, system, and reminder preparation. `execute` alone invokes charge/late-fee and outbox dispatch paths.
- Owner-attention delivery never marks the authoritative H4R item resolved.
- Queued/accepted provider work is no longer treated as actual send evidence.

## Remaining capability gaps found

- H4R has a callable leasing draft processor, showing optimization, marketplace actions, applications, showing requests, waiting-list state, and leasing alerts, but the draft processor is manual and can create repeated approval batches across scheduled runs. It must become idempotent and workspace-correct before the persistent operator invokes it.
- The inspected H4R source does not contain an authoritative maintenance-request/work-order workflow; the visible `maintenance` references are landlord expense categories and SMS-consent wording. Ferocity cannot truthfully claim persistent maintenance coordination until H4R has or identifies that canonical record/action path.
- Tenant, lease, document, charge, contact, and unit records exist, but there is no single controlled, resumable tenant-onboarding objective endpoint. The objective “set this person up and get them moved in” is therefore not yet certified end to end.
- The seven-day unattended acceptance test necessarily remains unproven until the migration/functions are deployed in `observe`, then `prepare`, and scheduled run evidence is collected. Source readiness is not production readiness.

## Persistent outcome layer added locally

Migration 238 and the operating goal engine now provide the missing durable outcome layer above H4R and Ferocity's existing actions. H4R owner events create or wake entity-linked goals; commitments, workforce punch lists, office tasks, and outbound actions can be linked without duplicating them. Deterministic evaluation handles waiting, blocked, owner-only, and completion-evidence states. Bounded AI planning is invoked only on material replanning demand and cannot directly execute consequential work. The complete findings, acceptance truth, and remaining dependency order are in `docs/PERSISTENT_OPERATING_GOALS_2026-10-07.md`.

## Local verification

- Ferocity focused suite: 8 files / 21 tests passed.
- Ferocity TypeScript and targeted ESLint passed.
- All five changed/new H4R Edge Function sources passed TypeScript syntax transpilation.
- The complete Ferocity `predeploy:local` gate passed: public/provider/capability/UI/architecture guards, rollback-only validation of pending migration 237, 217 Vitest files / 804 tests, seven Marketplace worker tests, TypeScript, full ESLint, the optimized 121-page production build, and document-runtime artifact verification.
- Production-like H4R migration/function deployment certification still remains before release.
