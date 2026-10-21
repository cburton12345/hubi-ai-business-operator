# Adaptive marketing and WhatSnap evaluation

Date: 2026-10-15
Status: implemented locally; not deployed

## Decision

Ferocity now evaluates paid channels from current source-to-cash evidence instead of projected economics alone. It compares the latest 30 days with the prior 30 days, classifies each channel as `hypothesis`, `learning`, `proven`, or `declining`, and records a governed action of `test_carefully`, `hold`, `scale_candidate`, `constrain`, or `repair_measurement` in the existing growth-controller evidence.

The 30-day comparison is a portfolio trend window, not the only learning cadence. Campaign snapshots now create incremental monitoring checkpoints whenever provider-reported spend crosses another `$5` boundary. Because providers may report in daily or larger increments, a checkpoint records how many boundaries were crossed rather than inventing observations the provider did not supply. Small spend remains observation-only; stop-loss is available at a meaningful configured floor and no tiny sample can become a winner.

No paid budget is changed by this assessment. A scale candidate remains a recommendation until the existing advertising approval, account-readiness, billing, tracking, prepaid-funds, and hard-cap controls allow execution.

## Existing systems reused

- `paid_media_performance_snapshots` remains the authoritative normalized provider read model for spend, qualified leads, appointments, sold jobs, attributed revenue, attributed gross profit, and attribution confidence.
- `growth_controller_snapshots` remains the decision record read by the AI Growth Department.
- Growth events, attribution touches, revenue attribution records, Marketing Memory, aggregate privacy gates, experiment records, direct-conversation links, approvals, and provider lanes remain canonical.
- Direct-to-conversation acquisition already supports tracked SMS, WhatsApp, phone, Meta Messenger, Instagram, Apple Business Chat, and RCS destinations with a Ferocity reference token and downstream conversion feedback.

## Safety and decision rules

- Paid spend with missing gross profit or attribution confidence below 50% produces `repair_measurement`, never a winner claim.
- Mature evidence requires at least 14 observed days, three attributed sold jobs, and a confidence score of at least 55.
- A gross-profit-return decline of 25% or more against the prior comparable window produces `declining` / `constrain`.
- Capacity mismatch, a breached owner CAC ceiling, or a breached economic floor constrains demand.
- A small sample remains a hypothesis or learning state even when top-of-funnel metrics look strong.
- Cross-channel budget proposals reconcile every approved cent exactly and continue to require approval.

## Business-specific and cross-customer learning

- Tenant-private evidence is segmented by the actual brand, service, geography, campaign, channel, objective, capacity, and source-to-profit outcomes available to that business.
- Industry cohort benchmarks are priors, not instructions. They may influence an initial hypothesis, but the customer's own qualified-lead, sold-job, collected-revenue, and gross-profit outcomes override them.
- Cross-customer contribution remains disabled by default and requires explicit owner consent.
- Only deidentified counters are contributed. Raw contacts, messages, creative, customer records, campaign names, and tenant identities are never placed in the shared playbook.
- A shared paid-channel benchmark is not published until at least five opted-in businesses and 50 observations contribute to the same industry/channel cohort.

## Current external market research

The scheduled Growth sweep now has a weekly live-web research path using the OpenAI Responses API web-search tool. It sends only public business context: industry, business model, service names, and service areas.

Research findings must:

- cite a URL actually returned by the research tool;
- label evidence as primary, secondary, vendor claim, or anecdotal;
- carry a 7–90 day expiration;
- explain the measurable implication without authorizing spend;
- treat retrieved pages as untrusted evidence, never instructions;
- cap vendor or anecdotal claims at hypothesis-level confidence;
- remain subordinate to the customer's measured outcomes.

The research path uses a compatible managed or customer-owned OpenAI credential, observes the workspace AI budget gate, runs at most weekly per active brand, and records web-search call cost plus model token usage. Failure returns no trend rather than fabricating one.

## WhatSnap findings

WhatSnap is a product-pattern reference only. This evaluation does **not** propose a WhatSnap integration, a dependency on WhatSnap, or copying its proprietary implementation. The objective is to reproduce the useful customer outcomes inside Ferocity's existing provider-neutral operating system.

The prompt's `whatsnap.io` identity could not be verified as the current product. The active product reviewed is WhatSnap at `whatsnap.ai`.

WhatSnap is primarily a bring-your-own-device bridge into GoHighLevel:

- Android devices provide SMS/MMS.
- A Mac plus iPhone provides iMessage.
- WhatsApp connects by QR session.
- Twilio can be bridged as another line.
- Custom API access is described as an enterprise/contact-sales capability, not a generally documented self-service API.
- Hardware, carrier plans, and platform accounts are separate from the subscription.
- WhatSnap's own terms place consent, opt-out, carrier, and platform compliance on the customer and acknowledge throttling, filtering, suspension, and banning risk.

The advertised `$40 to $9` cost-per-lead example was not substantiated in the reviewed product, help, pricing, or legal material. It is not accepted as Ferocity evidence.

### Integration decision

Do not add WhatSnap as a selectable Ferocity provider now. No stable public API, webhook contract, sandbox, data-processing terms, or platform-authorized iMessage automation path was verified. Exposing it would misrepresent readiness and add a GoHighLevel/device dependency to functionality Ferocity already models provider-neutrally.

Ferocity should continue testing direct-to-conversation strategy independently through its existing tracked destinations. There is no planned WhatSnap connection. A future owner request to integrate the provider would require a separate security, API, compliance, and commercial review.

### Product patterns Ferocity should retain

- Let the customer describe the desired outcome while Ferocity selects the appropriate supported channel and workflow.
- Connect the customer's existing authorized communication accounts instead of forcing a replacement platform.
- Reduce the path from advertisement or discovery to a real conversation when measured results support it.
- Respond quickly, preserve full business context, qualify the opportunity, schedule or route it, and hand off to a human when policy or judgment requires it.
- Synchronize the conversation, lead, appointment, job, payment, attribution, consent, opt-out, and delivery state through Ferocity's existing canonical records and adapters.
- Fall back cleanly between supported channels and never imply consumer iMessage, WhatsApp, SMS, or another channel is available when the required provider authorization is absent.
- Compare direct-to-message against landing pages, lead forms, calls, and other paths using qualified leads, sold work, collected revenue, gross profit, speed to lead, and customer preference—not vendor claims or message volume.
- Test in small governed increments, enforce stop-loss and budget limits, preserve audit evidence, and adapt from each business's results plus privacy-safe industry evidence.

These are Ferocity capabilities, not WhatSnap-branded features. They remain behind Ferocity's tenant isolation, permissions, approvals, provider certification, consent, cost controls, and audit trail.

## Validation

- Focused adaptive paid-media, closed-loop controller, market-evidence, and Growth Department tests pass: 4 files / 27 tests.
- The complete local predeploy gate passes: 265 files / 1,066 tests, TypeScript, ESLint, optimized 123-page build, worker checks, provider/capability/UI guards, pending-migration rollback validation, and document-runtime artifact verification.
- Live provider and production certification remain required after an authorized release.

## Live-validation checklist for a later authorized release

1. Apply the reviewed pending migration batch through migration 253 before enabling the new runtime.
2. Sync a connected read-only ad account with account-level daily snapshots.
3. Verify current and prior 30-day totals against the provider UI.
4. Verify missing gross profit or weak attribution produces `repair_measurement`.
5. Verify a mature improving channel becomes only a `scale_candidate`, with no spend mutation.
6. Verify declining return or full capacity produces `constrain`.
7. Verify a budget proposal sums exactly to the approved amount and cannot execute without existing spend authority.
8. Verify the AI Growth Department explains the business outcome, evidence window, confidence, and next governed action in plain language.
9. Complete one authenticated live web-research call, verify returned citations, cost telemetry, expiration, and prompt-injection resistance.
10. Confirm an opted-in five-business/50-sample cohort publishes only deidentified counters and that revocation stops future contribution.
