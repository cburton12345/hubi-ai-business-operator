# Ferocity Reality Recovery and Launch Plan

Date: 2026-09-27

## Current local recovery evidence

This section records completed local evidence without presenting it as a production deployment.

- Generated unified ledger: 142 entries across public outcomes, service features, command families, business actions, execution contracts, and providers.
- Public sales AI: a 30-industry, two-turn behavioral suite covers professional firms, field service, retail, ecommerce, nonprofit, property, healthcare-adjacent, agencies, manufacturing, multi-location, and other business models. All 30 scenarios passed live-model certification, including correction handling, focused recommendations, and verified `live_ai` response metadata.
- Authenticated command understanding: all 15 registered command families passed live-model recognition with retained AI usage evidence. The run exposed and corrected three routing weaknesses: an extra model label could discard the whole result, obvious reminder intent could be omitted, and phone/transfer intent could be misclassified.
- Public signup handoff: transcript order, roles, provenance, pre-auth safety, and idempotent workspace import passed.
- Golden operating loop: all 13 stages passed against the isolated QA tenant with no live messages, publishing, spend, charges, or provider actions.
- Provider-neutral business action layer: all 13 catalog actions passed runtime certification; protected job update/scheduling actions stopped at review and did not mutate the job.
- Authenticated chat routing: direct read commands now use the audited business-action gateway for leads, estimates, invoices, and commitments rather than merely linking to a screen.
- Capability discovery: expanded from three product suggestions to 13 contextual operating paths spanning growth, revenue, operations, communication, workforce, money, local presence, distribution, integrations, and owner attention.
- Truthful chat outcomes: advice, verified reads, prepared work, blocked work, and live external execution are no longer presented as the same result. Unmapped requests explicitly avoid claiming execution.
- Deployment status: not deployed. Production certification and paid traffic remain blocked until explicit owner authorization and the release gates below pass.

## Why this plan exists

The public Ask Ferocity experience exposed a serious failure class: a paid-action gate prevented the AI request, while deterministic fallback text still looked like an intelligent Ferocity response. The result was repetitive, low-value behavior on a page intended to prove Ferocity's intelligence.

This plan does not reduce Ferocity to 22 capabilities and does not disable useful systems merely because they are not externally certified. The 22-item registry covers only high-risk execution contracts. Ferocity currently contains at least:

- 37 gated product features
- 15 AI command capability families
- 9 recurring AI workflows
- 13 provider-neutral business actions
- 44 provider records
- 43 source-level workflow integration assertions
- 22 high-risk execution contracts

These inventories overlap and currently measure different things. The recovery goal is one authoritative system that proves what Ferocity can understand, prepare, execute, confirm, recover, and explain.

## Non-negotiable outcome

A user must be able to describe a business problem naturally and have Ferocity:

1. understand the business, goal, constraints, and current context;
2. identify the most useful opportunity or bottleneck;
3. explain what it recommends and why;
4. locate the correct Ferocity capability and screen;
5. read the authorized business data required for the task;
6. prepare or execute the work at the configured autonomy level;
7. request approval only when the action actually requires it;
8. verify the real outcome rather than assuming success;
9. recover or escalate when a dependency fails;
10. preserve the result in the business record and learn from it.

Public Ferocity performs steps 1-4 using public-safe information and carries the diagnosis into signup. Authenticated Ferocity performs steps 1-10 under tenant permissions and authority boundaries.

## Immediate incident containment

### IC-1: Public AI must fail honestly

- Never substitute a repetitive intake script while presenting it as live intelligence.
- Verify that a model actually completed each public response.
- If primary and recovery models fail, show a short honest outage message and preserve the visitor's message for retry.
- Alert Ferocity when failure or fallback rates exceed the threshold.

### IC-2: No paid traffic until the public path is certified

Paid traffic remains paused until the production journey passes:

`landing page -> intelligent conversation -> useful diagnosis -> capability guidance -> lead capture -> signup -> imported starting plan -> authenticated continuation`

### IC-3: One controlled release

- Finish and test the complete local correction.
- Deploy once only after explicit owner authorization.
- Run production canaries immediately after release.
- Roll back or disable the affected entry point if the canary fails.

## Workstream 1: Create the authoritative capability ledger

Build one generated ledger that joins every existing registry instead of replacing them:

- customer-facing capability and promise;
- page, chat, or command entry point;
- AI capability family;
- internal business actions used;
- required tables and authoritative data sources;
- provider dependencies and customer connection requirements;
- authority level and approval requirements;
- executor implementation;
- confirmation event proving success;
- failure and retry behavior;
- current environment certification;
- last successful test and retained evidence;
- public wording that is allowed at that evidence level.

Required states:

- `implemented_unverified`
- `locally_verified`
- `staging_certified`
- `production_certified`
- `customer_connection_required`
- `provider_approval_required`
- `degraded`
- `temporarily_unavailable`

Do not confuse these states with autonomy. A production-certified capability may still correctly require approval.

Exit criteria:

- Every public claim and visible integration resolves to a ledger entry.
- Every chat recommendation resolves to an actual capability and valid destination.
- No orphaned feature pages, buttons, or connectors.
- No capability is called live solely because source files or tables exist.

## Workstream 2: Certify the Ferocity intelligence layer

### Public intelligence evaluation

Create a repeatable evaluation suite covering at least:

- 30 industries across professional, local service, retail, ecommerce, nonprofit, healthcare-adjacent, property, agency, and multi-location businesses;
- growth, profit, cash, capacity, staffing, customer service, marketing, scheduling, collections, and operational-control goals;
- vague requests, detailed requests, conflicting goals, corrections, frustration, and follow-up questions;
- questions about Ferocity, capabilities, pricing, setup, limitations, and integrations;
- attempts to extract private implementation details;
- provider-dependent requests where availability must be qualified honestly.

Passing behavior:

- answers the actual question;
- uses prior turns;
- does not repeat a failed intake question;
- provides concrete business judgment;
- recommends only relevant capabilities;
- distinguishes advice, preparation, approval, and execution;
- never invents availability, price, provider state, or completed work.

### Authenticated operator evaluation

Test natural-language commands against real tenant fixtures across all 15 command families. For each test, verify:

- correct intent and entity resolution;
- correct workspace isolation;
- correct data read;
- correct business action selection;
- correct authority decision;
- expected record mutation or prepared approval;
- useful response and valid navigation;
- complete audit evidence;
- no action when required context is missing.

Exit criteria:

- Public and authenticated suites pass their required thresholds.
- Model calls, fallbacks, latency, and failures are observable.
- Every regression in the repetitive-chat failure class blocks release.

## Workstream 3: Prove the core operating journeys

Build real end-to-end tests with retained evidence for these journeys:

1. Prospect asks Ferocity -> receives diagnosis -> signs up -> plan appears in workspace -> continues with authenticated Ferocity.
2. Lead arrives -> qualification -> assigned follow-up -> estimate -> acceptance -> scheduling -> completion -> invoice -> payment -> review -> repeat/referral opportunity.
3. Owner asks for open or stale leads -> Ferocity reads real records -> prepares or executes authorized follow-up -> delivery and reply are recorded.
4. Owner asks to fill the schedule -> Ferocity evaluates demand, capacity, availability, geography, margin, and authority -> proposes or performs appropriate actions.
5. Incoming call -> AI handling -> context capture -> appointment or task -> requested human transfer -> call outcome stored.
6. SMS through each supported route -> consent check -> send -> delivery status -> inbound reply -> STOP/HELP behavior -> recovery after offline state.
7. Connected email -> read/classify -> draft or approved send -> threading -> delivery/reply evidence -> revocation.
8. Receipt or statement -> upload/batch/email -> extraction -> confidence review -> deduplication -> allocation -> Money/job-cost update -> searchable source document.
9. Job and workforce operation -> assignment -> availability/conflict check -> hours/evidence -> completion -> costing and payroll-ready record.
10. Marketing goal -> opportunity -> content/campaign preparation -> approval -> distribution -> lead capture -> revenue/profit attribution -> learning.
11. Provider connection -> OAuth -> account selection -> status change -> capability use -> token refresh -> failure -> reconnect -> revoke.
12. Billing and cancellation -> checkout -> entitlement -> provider usage -> overage behavior -> failed payment -> restoration -> cancellation and cleanup.

Each journey must test success, missing information, denied approval, provider timeout, duplicate request, retry, and tenant isolation.

Exit criteria:

- The complete golden business loop reaches every stage with actual entity IDs and retained evidence.
- No stage advances based only on an optimistic status flag.
- Recovery tests prove idempotency and prevent duplicate messages, charges, appointments, or records.

## Workstream 4: Replace static smoke tests with behavioral certification

Current source-presence checks remain useful as architecture guards, but must be renamed so they cannot be mistaken for runtime proof.

Add three layers:

1. **Contract tests** — schemas, permissions, adapters, and action interfaces.
2. **Behavior tests** — real database state changes and authority outcomes using isolated tenant fixtures.
3. **Provider certification tests** — controlled real-provider operations with confirmation and cleanup.

Every certification record must include:

- environment;
- tenant fixture;
- input and expected outcome;
- actual provider/request identifiers;
- confirmation event;
- cleanup result;
- timestamp and application version;
- failure details when unsuccessful.

Exit criteria:

- A passing “smoke” label can no longer mean string presence.
- The release gate consumes runtime certification evidence.

## Workstream 5: Make Ferocity itself capability-aware

The in-app chat should not rely on the owner knowing what to ask for.

Ferocity must:

- inspect business setup, missing data, stale work, risk, provider health, capacity, cash, follow-up, and growth signals;
- surface a small prioritized list of useful opportunities;
- explain why each matters and the expected business effect;
- offer to handle, prepare, or guide the next action;
- navigate to the correct screen when a visual decision is helpful;
- stop recommending capabilities that are unavailable for that tenant;
- explain what connection or permission would unlock a blocked outcome;
- remember accepted, rejected, deferred, and corrected recommendations.

Expand capability discovery beyond the current narrow recommendation set and connect it to the authoritative capability ledger.

Exit criteria:

- Every major product area can be discovered contextually.
- Recommendations are tenant-specific and never generic feature dumps.
- Owners can begin with an outcome instead of learning the menu.

## Workstream 6: Provider and connector reality program

For all 44 provider records:

- separate Ferocity developer approval from customer OAuth connection;
- verify the customer connect/reconnect/revoke experience;
- verify token refresh and expired-permission behavior;
- show honest per-tenant capability status;
- certify reads and writes separately;
- prevent one marketing account or policy issue from silently disabling unrelated platform infrastructure where separation is possible;
- preserve native/manual/assisted fallbacks without presenting them as direct API execution.

Prioritize provider certification by customer value:

1. authentication, database, email delivery, billing;
2. Ferocity chat and business actions;
3. calls, SMS, email, calendar, payments;
4. Meta, Google, TikTok, Microsoft, Reddit, YouTube, local presence;
5. vertical CRMs, accounting, and additional ad/social providers.

Exit criteria:

- Connection status is derived, not manually optimistic.
- Every connected provider has a real health check and last-success evidence.
- Revocation removes Ferocity access and clearly states any provider-side step still required.

## Workstream 7: Public truth and conversion protection

Create public copy from verified customer-facing outcomes, not internal implementation inventories.

Rules:

- Show breadth without revealing proprietary orchestration.
- Say “can prepare” when execution is not certified.
- Say “connect your account” when customer OAuth is required.
- Say “available after provider approval” when Ferocity-side approval remains open.
- Never show developer credentials or internal connector setup to ordinary customers.
- Never advertise a live automation that currently produces only a draft or export.
- Keep strong positioning: Ferocity is the operating system and intelligence/control layer, not a generic AI wrapper.

Add automated claim checks so public wording cannot exceed the capability ledger's allowed state.

Exit criteria:

- Homepage, pricing, feature pages, integrations, onboarding, and in-app status agree.
- Public chat answers from the same verified customer-safe capability data.

## Workstream 8: Customer experience certification

Test the product as a new owner who knows nothing about Ferocity:

- landing and chat;
- pricing and signup;
- invitation and password setup;
- first workspace entry;
- first useful conversation;
- first connected account;
- first approved action;
- first confirmed result;
- navigation on desktop and mobile;
- notification and attention handling;
- permissions, revocation, billing, support, and cancellation.

Use task-based usability tests rather than asking whether the interface “looks good.” Measure:

- time to first useful result;
- time and clicks to connect a provider;
- comprehension of what Ferocity did;
- comprehension of what needs approval;
- recovery from mistakes;
- percentage of users who can complete setup without assistance.

Exit criteria:

- A new user does not land on a settings wall.
- Ferocity leads setup conversationally.
- Advanced controls remain available without dominating the first experience.

## Workstream 9: Production observability and automatic protection

Monitor by capability and tenant:

- model invocation and fallback rate;
- response quality evaluation failures;
- command classification and correction rate;
- action prepared/executed/confirmed/failed counts;
- provider latency, errors, token failures, and rate limits;
- unconfirmed actions and overdue commitments;
- duplicate prevention;
- approval wait time;
- conversion and business outcome when measurable.

Automatic protection:

- circuit-break a failing executor without disabling unrelated Ferocity functions;
- fall back from execution to preparation when safe;
- tell the user exactly what is unavailable and what remains usable;
- create an owner/support incident with evidence;
- never silently pretend success.

Exit criteria:

- A broken dependency degrades one capability, not the entire platform.
- Ferocity can explain its current operating health in plain language.

## Workstream 10: Controlled launch sequence

### Gate A — Local

- Complete capability ledger.
- Pass intelligence evaluations.
- Pass behavioral tests for core internal actions.
- Pass production build and security checks.

### Gate B — Production canary

- Deploy only with explicit owner authorization.
- Test Ferocity-owned workspace with no public traffic.
- Verify public chat, signup handoff, authentication, billing, and first action.

### Gate C — Internal operation

- Use Ferocity to operate Ferocity for at least seven days.
- Record failures, corrections, false recommendations, and unconfirmed actions.
- Resolve launch-blocking defects.

### Gate D — Controlled pilot

- Onboard a small number of real businesses in different industries.
- Enable capabilities progressively by evidence and tenant choice.
- Provide fast human support while measuring autonomous performance.

### Gate E — Paid acquisition

Paid campaigns can begin only when:

- public conversation quality is certified;
- signup and first-use paths are certified;
- public claims match production evidence;
- lead capture and Ferocity follow-up are working;
- monitoring and rollback are active;
- at least the promoted customer journey works end to end.

Do not wait for every future integration before marketing. Advertise only the certified outcomes, then expand claims as more capability paths pass.

## Execution order

1. Finish the public-chat incident correction and evaluation suite.
2. Generate the unified capability ledger from existing registries.
3. Replace misleading source-only test names and add behavioral certification.
4. Certify signup-to-authenticated-chat continuation.
5. Certify the lead-to-cash golden loop.
6. Certify core communications: calls, SMS, email, and calendar.
7. Certify receipts, jobs, workforce, money, and payments.
8. Certify marketing, publishing, local presence, and attribution by provider.
9. Run Ferocity internally for seven days with monitoring.
10. Run a controlled multi-industry customer pilot.
11. Reconcile public claims and approve one launch release.
12. Begin paid acquisition only for the proven journeys.

## Definition of done

Ferocity is launch-ready when a prospect can see an accurate promise, receive intelligent guidance, become a customer without confusion, ask Ferocity for an outcome, watch the correct authorized work occur, verify what happened, recover safely when something fails, and understand the resulting business value—without needing to know which internal tool, model, prompt, table, or provider made it happen.
