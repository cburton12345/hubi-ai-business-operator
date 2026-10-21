# Persistent operating goals — October 7, 2026

Status: migrations 238, 244, and 245 are applied to the Ferocity production database; the durable goal foundation, owner runtime controls, and resumable plan-step state are live at the data layer. The related frontend/automation source remains undeployed.

October 8 control follow-up:

- owners can pause, resume, retry, or cancel an existing operating goal without creating a duplicate or discarding its audit history;
- paused goals stay dormant until explicitly resumed, while resume/retry wakes the same goal for safe re-evaluation and replanning;
- completed and verified outcomes cannot be rewritten through runtime controls, and canceled outcomes cannot be silently reopened;
- the production runtime certification exercised create, pause, resume, retry, durable memory, and exact action-receipt links, then removed all temporary QA records.

October 8 execution follow-up:

- every bounded plan step is now materialized in `operating_goal_steps` with its plan version, order, action type, dependencies, authority requirement, evidence requirement, attempts, current state, linked artifact, and safe error;
- the scheduled tenant loop runs the step executor immediately after planning and resumes waiting steps after dependencies or authoritative evidence change;
- safe related-record inspection may complete automatically; a single unambiguous internal worker assignment may be created only under goal-level `execute` authority or an approved review; ambiguous assignments route to the existing approval surface;
- communication steps remain prepared for review because exact recipient, consent, channel, provider, and message gates cannot be inferred from a plan title;
- external events and outcome verification remain waiting until real evidence exists; completed work still cannot be confused with a completed business outcome;
- Ask Ferocity's compact goal card now shows completed/total steps, active work, owner-review count, and the exact current artifact link without expanding the page into another dashboard;
- production runtime certification materialized a temporary plan step, advanced it into a resumable waiting dependency, verified the stored state, and removed the entire temporary goal graph through cascade cleanup.

## Targeted findings

- `operating_commitments` already tracks promises, responsible parties, deadlines, evidence, and follow-through. It is an execution primitive, not a durable outcome model.
- `operations_assignments.task_list_json` is the existing worker/punch-list primitive. Employees already have assignment-scoped access, time, cost, mileage, and proof capture. The work list previously exposed only a task count for ordinary assignments; it now shows and updates the actual checklist without adding a second task system.
- `service_operational_tasks` is an office operations queue. `ai_tasks` and AI Workforce runs are model-work queues. Neither should become a general outcome store.
- H4R already persists leases, units, charges, collection cases, promises, payment plans, leasing alerts, owner notifications, and provider outboxes. Its October 7 conductor makes the strongest existing rent/collection paths resumable, but H4R still lacks a canonical maintenance work-order flow and one resumable tenant-onboarding endpoint.
- Before this change, no object joined an owner's desired outcome to commitments, worker assignments, provider actions, external events, missing capabilities, completion evidence, future checks, and replanning state.

## Implemented foundation

Migration `238_persistent_operating_goals.sql` adds:

- tenant-scoped `operating_goals` with desired outcome, authoritative domain, related/external entities, priority, target, authority ceiling, current state, bounded plan, completion rules, constraints, blind spots, evaluation version, and next evaluation time;
- `operating_goal_dependencies` for goals, commitments, worker assignments, office tasks, outbound actions, integrations, capabilities, information, people, and external events;
- idempotent `operating_goal_events` as the observation/audit timeline;
- tenant-matched foreign keys from existing commitments, workforce assignments, service tasks, and outbound actions to a goal;
- database triggers that wake a linked goal when child work changes, including changes made outside the application process;
- RLS for owner/admin/operator access and no new customer/provider secret surface.

`src/lib/operations/goal-engine.ts` provides deterministic lifecycle control:

- terminal goals do not reopen during later scans;
- queued or provider-accepted work remains in progress and is not completion evidence;
- linked failures and blocked dependencies trigger replanning without automatically dumping work on the owner;
- only explicit owner-only dependencies or missed critical outcomes enter owner attention;
- capability, integration, and information dependencies become visible blind spots;
- external responses/events create a durable waiting state with a future check;
- completion requires resolved required dependencies plus explicit outcome evidence;
- goal/event creation is idempotent and human assignments are created in `operations_assignments`, not a parallel AI task table.

`src/lib/operations/goal-planner.ts` adds bounded AI judgment only when deterministic evaluation requests replanning:

- at most two goals per tenant automation pass and at most one attempt per goal within six hours;
- existing AI entitlement, credential, usage, budget, provider, and audit controls remain in force;
- the model can propose only inspection, existing worker assignment, communication preparation, waiting, missing-information, or outcome-verification steps;
- no plan executes money movement, tenant selection, legal decisions, sends, publishing, or spend;
- invalid or fallback output is recorded as unavailable and never presented as a real plan.

The leased business automation loop now prioritizes tenants with due goals, evaluates linked work, performs bounded replanning, and reports progressing/waiting/blocked/owner-only counts in the owner brief.

H4R owner events now create or wake a domain-linked persistent goal through `src/lib/integrations/h4r/goal-observation.ts`. The goal records H4R as authoritative, preserves the source workspace/entity identity where supplied, and treats an owner alert as an observation rather than outcome completion.

The H4R behavior is no longer a special-case architecture. `src/lib/integrations/goal-observation.ts` provides the shared connected-system observation contract:

- actionable provider events bind idempotently to a stable business entity and durable goal;
- informational sync traffic does not create disposable goals;
- a resolved provider event updates an existing goal rather than inventing a new one;
- provider acceptance, queueing, delivery, and owner-event resolution are not treated as business-outcome completion;
- verified completion requires an explicit authoritative-outcome flag plus non-empty outcome evidence;
- existing approval, consent, spend, certification, and execution gates remain unchanged.

The shared intake is used immediately by the owner-command event endpoint for every platform, by the signed service-platform bridge (Jobber, Housecall Pro, HighLevel, HubSpot, and ServiceTitan), MarketplacePro, Stripe service-invoice outcomes, and phone-provider exceptions. The automation loop also backfills actionable events written directly to `owner_command_events`, without repeatedly reconsidering informational events.

`src/lib/operations/goal-integration-health.ts` reconciles goal dependencies against owner-platform connections, generic OAuth/integration connections, provider accounts, provider lanes, customer mailboxes, and Ferocity Connect devices. A disconnect or expired credential blocks the dependency and surfaces a blind spot; restoration satisfies and wakes it automatically. Connection health never enables a protected live action by itself.

The existing employee work list now renders checklist items and permits an assigned employee, crew member, visit assignee, or authorized manager to check/reopen them. All items complete the assignment and wake the linked goal; the larger goal still requires authoritative outcome verification.

Authenticated Ask Ferocity now recognizes explicit outcome language such as “get this unit rent-ready and occupied,” “set John up and get him moved in,” or “resolve this until it is finished.” It creates one idempotent operating goal rather than a reminder or disposable chat task. Questions and ordinary reminders remain questions/reminders. The initial goal stays in `prepare` authority and cannot bypass external-action controls.

## Acceptance truth

| Test | Local source result | What is still needed for production proof |
| --- | --- | --- |
| Persistence | Goal, dependencies, events, plan version, next check, and child links are database-durable. | Apply migration and observe a goal across a real seven-day scheduled run. |
| Outcome | Actions cannot complete a goal without explicit outcome evidence. | Exercise an H4R outcome callback against production-shaped data. |
| Human work | Ferocity can create an existing workforce assignment; assigned workers can see/check its punch list; changes wake the goal. | Role-based browser certification with a real owner and employee account. |
| Reasoning | Material change/failure sets `requiresReplan`; bounded AI proposes only typed, non-executing steps. | Production-like configured-model run plus a changed-circumstance scenario. |
| Attention | Only explicit owner dependencies or missed critical outcomes create owner events; resolved blockers clear the event. | Push-channel certification with owner preferences and a real device. |
| Blind spot | Missing integration/capability/information dependencies are stored and surfaced. | Feed complete H4R capability state, not only owner-alert events. |
| Connected systems | Shared observations and connection-health dependencies cover the canonical connection tables and initial high-value provider adapters. | Exercise each configured provider with signed production-shaped events and verify exact record/goal linkage. |
| Seven-day H4R | H4R conductor and Ferocity goal loop are both scheduled/durable in source. | Deploy first in `observe`, then `prepare`; collect seven days of run/event evidence. |

## Remaining H4R work in dependency order

1. Add a broader signed H4R observation feed for authoritative collection, lease, application, unit-readiness, payment, and completion changes. The current bridge supplies owner exceptions, not every state transition.
2. Make the existing H4R leasing draft processor workspace-correct and idempotent before scheduling it.
3. Add or identify H4R's canonical maintenance request/work order/vendor/verification records. Until then, Ferocity can coordinate a Ferocity workforce assignment but cannot truthfully claim H4R-native maintenance state.
4. Add one resumable H4R tenant-onboarding command/status contract over the existing tenant, lease, charge, document, contact, deposit, and move-in records.
5. Add completion/verification observations from H4R so collection, occupancy, onboarding, and maintenance goals can close from authoritative evidence.
6. Expand Ask Ferocity goal intake from safe intent recognition to authoritative entity resolution and missing-fact collection, so it links the exact H4R property/unit/tenant/case instead of waiting for a later H4R event to supply that identity.

## Verification completed

- The full `predeploy:local` gate passes against the provider-neutral extension: all public/provider/capability/UI/architecture guards, rollback-only migration validation, 223 Vitest files / 833 tests, seven Marketplace Worker tests, TypeScript, full ESLint, the optimized 121-page production build, and document-runtime artifact verification.
- Production migration validation reports zero pending migrations, and the RLS/sensitive-grant audit passes.
- No deploy, provider send, charge, late fee, campaign, or external message occurred.
