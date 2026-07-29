# Configure Once Preference Architecture

Status: implemented and locally verified July 29, 2026.

## Product rule

Ferocity remembers repeatable decisions, resolves the most specific valid preference, and keeps the current choice changeable inside the task. Legal restrictions, consent, opt-outs, and suppression always win.

Normal users see the current choice, where it came from, Continue, and Change. Provider selection, approval detail, language behavior, and fallback policy stay under Advanced.

## Resolution

`scoped_saved_preferences` stores reusable JSON preferences for organization, department, location, workflow, user, contact, customer, job, and project scopes. Callers provide the valid scope order for their feature.

Communications resolve in this order:

1. legal restriction, consent, suppression, or contact prohibition;
2. contact preference;
3. workflow preference;
4. user preference;
5. organization default;
6. safe product fallback.

One-time overrides are applied without changing a saved default.

## Communication workflow

Voice, messaging, and email have independent adapters and routing. A communication step can store its method, execution mode, provider-selection behavior, approval level, language behavior, automation level, and fallback policy.

The Action Queue is the shared execution point. It displays the resolved choice inline and offers this-time, workflow, contact, user, and organization save scopes. Native SMS, Google Voice-assisted copy/open, email draft, copy-only, AI voice, and human call remain valid even when an automated provider is unavailable.

## Contact preferences

Lead and customer records expose one collapsed Contact preferences control. It stores preferred method and language, quiet hours, best contact time, preferred employee or department, call-before-texting, no-marketing-texts, and no-AI-calls.

No-AI-call and no-marketing-text restrictions are enforced before an inline communication change is accepted. Consent and suppression checks remain separate, higher-priority controls.

## Failure behavior

Provider failures create `communication_failover_events` with the original provider and method, failure reason, alternatives offered, selected fallback, policy, and final outcome. Fallback is automatic only when the saved policy explicitly allows it. Otherwise the queue preserves the failure and offers assisted alternatives based on available contact information.

## Audit and reuse

`preference_audit_events` records creation, changes, resolution, one-time overrides, promoted defaults, and policy blocks. The persistence and resolution service is domain-neutral, so estimates, invoices, schedules, payments, marketing, reports, jobs, and AI behavior can reuse it when a choice is truly repeated. Features should expose the current choice at the action point instead of creating unnecessary settings pages.

## Verification

- Migration `144_scoped_saved_preferences.sql` applied.
- Tenant RLS and sensitive-table checks passed.
- 129 tests passed.
- TypeScript, ESLint, public-copy, UI-quality, and feature-integration gates passed.
- Optimized production build passed.
- Local signed-in QA confirmed inline overrides, collapsed Advanced controls, contact preferences, and voice activation independent of optional SMS.

No frontend deployment was performed.
