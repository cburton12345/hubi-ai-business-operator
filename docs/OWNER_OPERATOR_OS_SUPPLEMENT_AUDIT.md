# Owner/Operator OS Supplement — Repository Audit and Implementation Map

Date: 2026-09-21
Scope: the 555-part Owner/Operator OS supplement, evaluated against the current Ferocity repository.
Release rule: implementation may be prepared and tested locally; no front-end or production deployment is authorized by this work.

## Executive conclusion

Ferocity already has much of the required nervous system: tenant-scoped events, an operator timeline, an Owner Command Center, governed action requests, provider-neutral business actions, capability trust levels, an authority engine, idempotency and audit records, long-running automation, customer/job health, growth loops, communications, billing and provider-health surfaces. Replacing those systems would move the product backward.

The most important missing shared primitive was a durable commitment/outcome record: who promised what, to whom, by when, what result was expected, whether it happened, and what evidence proves it. This pass implements that primitive and connects it to completed voice calls, the central automation runner, the daily owner brief, the Owner Command Center, the operator timeline, and the provider-neutral business action layer.

## Capability matrix

| Supplement area                                                                 | Current state                    | Existing Ferocity foundation                                                                  | Decision                                                 |
| ------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1–13 operating executive, authority, events, daily loop                         | Strong                           | Owner Command Center, authority engine, action requests, event/timeline system, daily brief   | Extend; do not duplicate                                 |
| 14–20 commitments, DRIs, pre/post action                                        | Partial → implemented foundation | Call orchestration and action items existed; canonical commitment state did not               | Added durable commitments and outcome lifecycle          |
| 21–38 customer health, SOPs, KPIs, bottlenecks, verified outcomes               | Mixed/strong                     | Customer lifecycle, job health, reports, workflow and growth controllers                      | Connect incrementally to commitments/outcomes            |
| 39–76 operating executive, retention, workforce, risk and finance               | Mixed                            | AI Workforce, follow-up workflows, owner needs, revenue loops, provider and capability health | Build owner-value slices, not a second OS                |
| 77–106 cash, procurement, readiness, scheduling, completion-to-cash             | Mixed/strong                     | Money, estimates, jobs, invoices, collections, construction health, readiness checks          | Improve causal and outcome links in later slices         |
| 107–130 people, policy, autonomy, learning, simulation                          | Partial                          | Permissions, roles, policies, approval modes, capability trust, audits                        | Preserve human sovereignty; expand only with evidence    |
| 131–180 digital twin, goals, owner-away, playbooks, progressive autonomy        | Partial                          | Business Brain, Growth controller, saved preferences, trust ladder, monitoring                | Incremental; no all-knowing score or fake precision      |
| 181–250 natural-language policy, trust, economics, truth and ROI                | Mixed                            | Conversational owner layer, source data, usage/cost controls, audits                          | Add provenance and calibrated outcome metrics over time  |
| 251–304 owner experience, outcome engine, external agents, implementation rules | Strong direction                 | Owner Command Center, business actions, action queue, Connect and integration abstractions    | Commitments now appear in the existing owner layer       |
| 305–377 controls, incidents, capacity, forecasting, decision quality            | Partial                          | Service gates, runtime policy checks, weather/job health, staged capability trust             | Prioritize material exceptions; reject bureaucratic UI   |
| 378–449 one Ferocity, goals, governance, reliability and evaluation             | Strong/partial                   | One AI Workforce, central automation runner, audit ledger, model/provider abstractions        | No agent theater; add tests and replay before autonomy   |
| 450–509 sandboxing, concurrency, durable state, sources of truth, moat          | Mixed/strong                     | Idempotency, leases, execution audits, provider registries, import systems                    | Extend foundations; do not invent a generic BPM platform |
| 510–555 architecture, UI layers, phases and success tests                       | Adopted                          | Existing boundaries match the intended layers                                                 | Use this document and vertical-slice plan                |

## What this pass added

1. `operating_commitments` as tenant-scoped durable business state, plus an append-only commitment event history.
2. Explicit states: needs confirmation, active, due soon, overdue, blocked, completed, verified and canceled.
3. Responsible-party, deadline, source, related entity, expected outcome, confidence and completion-evidence fields.
4. Conservative inference: unstructured or incomplete action items remain `needs_confirmation`; inference does not silently become fact.
5. Completed voice-call action items feed the commitment engine.
6. The central automation loop advances deadline state, prepares follow-through work, and escalates only critical broken commitments.
7. Daily briefs report due, overdue and unconfirmed commitments.
8. The existing Owner Command Center shows open commitments and supports confirmation, completion evidence and outcome verification.
9. All state changes are written to the operator timeline and commitment history.
10. Provider-neutral `getOpenCommitments` and `createCommitment` actions let Ferocity's native workforce use the same governed action layer future outside agents can use after separate certification.

## Architecture map

```text
Providers / Connect / product modules
        ↓ normalized events and facts
Event + timeline system (nervous system)
        ↓
Business state + commitments + outcomes (durable truth)
        ↓
Central automation + AI Workforce (execution)
        ↓
Authority, approval and capability trust (governor)
        ↓
Owner Command Center / Ferocity chat (executive interface)
        ↓ corrections, decisions and verified outcomes
Audit history + learning inputs
```

The model may reason and propose. Deterministic application code continues to enforce tenant boundaries, permissions, authority, approvals, idempotency and provider capability truth.

## Deliberate non-implementations

- No second owner dashboard, AI workforce, automation runner, memory store or provider framework.
- No literal promise that Ferocity removes the owner. The product reduces routine dependence while the owner remains sovereign.
- No invasive employee surveillance, invented causality, false forecast precision or cross-tenant learning leakage.
- No automatic legal, employment, banking, large-spend or irreversible action without explicit authority and confirmation.
- No feature-soup navigation or generic rule-builder/BPM product.
- No public outside-agent compatibility claim until authentication, scopes, revocation, rate limits and end-to-end tests are certified.

## Phased implementation plan

### Phase 1 — shared state and follow-through (started in this pass)

- Commitments and evidence-backed outcomes.
- Reuse existing events, approvals, audit records and owner surfaces.
- Next connectors: meetings/email, estimates, jobs, schedules and invoices.

### Phase 2 — highest-value owner-replacement loops

- Lead/estimate promise follow-through.
- Job readiness and blocker ownership.
- Customer expectation mismatch and recovery.
- Completion-to-cash and promise-to-pay.
- Decision packets with recommendation, evidence, deadline and cost of delay.

### Phase 3 — cross-module coordination

- Capacity-aware sales promises and schedule recovery.
- Customer/job/financial health tied to a common outcome vocabulary.
- Explicit causal links only where evidence supports them.

### Phase 4 — guarded autonomy

- Shadow → assisted → trusted → autonomous progression per capability and tenant.
- Canary rollout, action budgets, blast-radius limits, expiration and automatic trust reduction.

### Phase 5 — learning

- Decision outcomes, owner corrections, workflow versions and business-specific evaluation sets.
- Privacy-preserving aggregates only; tenant facts never leak across businesses.

### Phase 6 — advanced operating intelligence

- Calibrated scenarios, cash/capacity forecasts and what-if analysis.
- Digital-twin language only when data freshness, uncertainty and validation warrant it.

## External dependencies and limits

Provider credentials, account approval, live phone/SMS/email/social permissions and financial data access remain external prerequisites. Ferocity must show `blocked`, `needs setup`, `degraded` or `needs review` instead of claiming success when a provider is unavailable. The commitment engine itself is internal and provider-neutral.

## Completion standard

This 555-part supplement is a north-star architecture, not 555 independent checkboxes. It is not complete until representative businesses can pass the owner-away, employee-forgot, customer-should-not-ask, money-should-not-get-lost and real-world-action-verification tests with measured evidence. Each future slice must include durable state, a responsible party, authority checks, execution, verification, observability, failure recovery and a simple owner experience.
