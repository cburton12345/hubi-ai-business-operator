# Ferocity automation readiness truth — 2026-09-20

This is the plain-language source of truth for whether Ferocity merely has a feature, can prepare work, can execute after approval, or can safely run that work unattended. It supplements the detailed launch checklist; it does not replace provider-specific certification evidence.

## Executive answer

Ferocity has a real shared operating system rather than a collection of disconnected demos:

- one scheduled business-automation runner;
- tenant-isolated queues and domain records;
- a provider-neutral business-action layer;
- approval, consent, budget, rate-limit, idempotency, audit, notification, and emergency-pause controls;
- shared customer, lead, job, money, communication, workforce, marketing, and reporting context;
- an owner attention path for ambiguity, money, safety, legal risk, customer trouble, failed automation, and required decisions.

That foundation is sufficient for useful guarded automation. It is not evidence that every advertised outcome is already safe to run unattended. External providers, money movement, public publishing, phones, physical devices, and ambiguous business decisions require separate live certification.

## The four automation states

Every consequential Ferocity capability must resolve to exactly one of these states at runtime:

1. **Automatic now** — the full loop is implemented, enabled, healthy, authorized, within budget, and live-certified.
2. **Ready after approval** — Ferocity can prepare the exact action, but must obtain the configured human approval before execution.
3. **Needs connection or setup** — the workflow exists, but credentials, account approval, sender identity, funding, data, or configuration is missing.
4. **Unavailable** — the adapter, provider capability, certification, or required product behavior is not complete. Ferocity must not imply that it will execute.

“Autopilot enabled” grants authority within policy. It is never a promise that an unhealthy, disconnected, uncertified, over-budget, or non-existent provider action will run.

## Current capability matrix

| Business area | What is genuinely connected | What prevents full unattended operation |
| --- | --- | --- |
| Business setup and recommendations | Website/business intake, business context, gap scan, prioritized recommendations, and Ferocity Chat orchestration exist. | Final conversational onboarding must be certified with real first-time customers after the next deploy. |
| CRM, leads, and follow-up | Lead capture, qualification, customer history, lifecycle state, stale-lead detection, queued follow-up, reply-stop behavior, and attribution share the same records. | Actual email/SMS/call delivery depends on a healthy certified route, consent, customer authority, and usage limits. |
| Jobs, tasks, scheduling, and field work | Native records, assignments, conflicts, field workday, time, mileage, proof, receipts, status, and completion checks exist. | Two-account mobile testing, Spanish walkthrough, offline binary proof, and external calendar reconciliation remain certification items. |
| Estimates, invoices, and collection | Estimates, approvals, signatures, invoices, payment links, reminders, ledger records, and guarded collection work exist. | One complete real paid subscription/customer-money lifecycle, refunds/disputes, reconciliation, and provider recovery still require live evidence. |
| SMS and shared conversations | Provider-independent messaging, consent, suppression, quiet hours, Message Health, receipts, retry, usage controls, Vonage adapter, and Ferocity Connect exist locally. | Vonage credentials/sender/registration/webhooks and a physical Connect certification are still required. Provider acceptance is not treated as delivery. |
| Email | Platform email and customer-mailbox architecture exist with guarded sending and conversation context. | Each mailbox/provider connection needs a valid grant and live send/receive/revoke certification before unattended customer email is enabled. |
| Voice and phone answering | Retell-oriented call, context, transcript, transfer, number-lifecycle, usage, and provider-neutral routing architecture exists. | First controlled managed-number provisioning, inbound callback, tenant-specific transfer, billing recovery, release/port-out, and concurrency behavior still need production certification. |
| Marketing content | Business-grounded planning, Brand Voice, content generation, quality review, variations, assets, cadence, approval, and performance records are connected. | Public publishing remains channel-connection and certification dependent. Premium media generation and provider fees are budgeted usage, not unlimited plan activity. |
| Organic distribution | Plan entitlements, opt-in cadence, quality gates, channel adaptation, scheduling, and publishing queues exist. | Each social destination must be connected and live-certified; community rules and account health can still block execution. |
| Facebook groups and Marketplace | The worker abstraction, local Windows worker, pairing, recovery, policy capture, owner attention, and guarded actions exist. | Broad unattended group activity is not certified. Join questions, warnings, moderation, account health, and anti-abuse boundaries require human review and controlled testing. |
| Paid advertising | Research, campaign ideas, creative, audience logic, budget controls, attribution, and approval paths exist. | Ferocity must not spend until the specific ad account is connected, funded, approved, certified, and the owner has authorized the applicable budget/policy. |
| Reviews and referrals | Review/referral triggers, tracked links, service-recovery routing, attribution, and follow-up records exist. | Review-platform ingestion and outbound delivery are provider-gated. Negative or ambiguous service experiences must not be auto-solicited. |
| Receipts and expense intelligence | Reusable document intake, batch handling, extraction, confidence review, deduplication, allocation, source preservation, and job-costing/accounting paths exist locally. | Real varied-document accuracy, statement reconciliation, storage retention, and downstream accounting exports need controlled production evidence; low-confidence fields require review. |
| Employees and payroll preparation | Roles, invite/join, scheduling, time, location permission, work proof, advances, reimbursements, compensation rules, and exports exist. | Payroll-provider execution and final bilingual physical-device certification remain gated. Ferocity does not silently move payroll money. |
| Support and owner attention | Durable support cases, admin escalation, push/email attempts, failure logging, owner events, and attention views exist. | One real production request must be submitted, notified, worked, and resolved after the final deploy. |
| External AI workers | Provider-neutral business actions, tenant scope, permissions, audits, approvals, and native-agent use are implemented. | No public MCP/API connection for outside agents is live. External identity, grants, tokens, rate/spend limits, redaction, approval continuation, and client certification remain required. |

## What “fully automated” must mean

A workflow is fully automated only when all of the following are true:

- it has a real trigger and authoritative source data;
- the required provider/worker adapter exists;
- credentials and tenant ownership are valid;
- the provider account is approved, funded, and healthy;
- required consent and legal policy are satisfied;
- the user has granted the necessary authority;
- budgets, rate limits, usage entitlements, and quiet hours allow the action;
- execution is idempotent and tenant-isolated;
- delivery or outcome evidence returns to Ferocity;
- replies or changed business state stop or redirect the sequence;
- failures are retried safely or surfaced to the owner;
- cost and business outcome are recorded;
- the exact live path has certification evidence.

If any item is missing, Ferocity must downgrade the action to approval, setup, or unavailable instead of pretending it ran.

## Remaining work before broad “runs your business” promotion

1. Complete the real Stripe payment, failure, grace, restoration, refund/dispute, and reconciliation journey.
2. Certify one managed phone number end to end and then verify two-tenant isolation.
3. Activate and certify Vonage deliberately; rerun the full Connect physical-device test.
4. Certify Gmail/Outlook send, receive, thread mapping, revoke, token expiry, and reconnect behavior.
5. Certify organic publishing on each promoted channel; leave paid spend separately approved.
6. Complete the Facebook/Marketplace controlled loop without claiming unrestricted group automation.
7. Run first-time-user conversational onboarding with real people and remove every dead-end status card.
8. Complete the bilingual field-team walkthrough and physical mobile/offline checks.
9. Run real receipt/document accuracy and reconciliation fixtures, including multi-page statements.
10. Submit and resolve a real support case, then run the complete post-deploy customer journey and retain evidence.

## Product rule going forward

No new feature is “done” because it has a page, schema, setting, prompt, or adapter. It is done only when its trigger, execution, evidence, failure recovery, owner visibility, permissions, cost controls, and live certification are all present.

The correct public position today is:

> Ferocity can understand the business, prepare the work, automate many internal workflows, and carry approved work through connected services. It progressively handles more as accounts are connected and policies are approved. High-risk decisions and any unavailable or unhealthy external action remain visible instead of being silently guessed.

Do not claim universal hands-free operation until the remaining live loops above are certified.

## Evidence captured in the 2026-09-20 no-deploy finishing pass

- The complete local release gate passed: public-data guard, provider truth, capability truth, UI quality, 42 workflow-integration checks, pending-migration validation, 570 application tests, 7 Marketplace worker tests, TypeScript, lint with no errors, and a 107-route production build.
- The workflow engine reported 63 active workflows, no missing next-run timestamps, and no failed or stuck executions. Sixteen follow-ups and four review requests remain legitimate business work, not engine failures.
- The isolated `ferocity-qa-demo` workspace now has a certified 13/13-stage lead-to-growth loop with zero handoff gaps and an expiration date of 2026-12-20. It used labeled synthetic evidence and triggered no live provider actions. The main production workspace still needs one genuine customer/payment journey before this can be treated as real-world financial certification.
- Stripe Connect is connected with charges and payouts enabled and no currently due requirements. A complete real subscription/payment-failure/refund-dispute/reconciliation journey is still required before unattended money claims.
- Retell accepted the configured API key and passed callback evidence. Inbound is enabled on the managed number; outbound remains disabled. The tenant transfer destination and Retell transfer tool are still missing. Concurrency is 20, with five inbound slots reserved and a 15-call outbound soft limit.
- TikTok OAuth was refreshed successfully for `ferocity78`. This proves identity/basic connection only; it does not certify organic publishing or paid advertising.
- Jobber remains deliberately unavailable until the provider OAuth application credentials and callback are configured and the workspace reauthorizes.
- The Facebook/Marketplace connector readiness check and worker recovery suite passed locally. Broad unattended group posting remains uncertified and policy-gated.
- Receipt Intelligence readiness passed with migrations 211–213, private storage, and active aliases. Its full real-document certification list remains post-deploy work.
- A controlled Resend delivery request was accepted and returned provider message ID `01a0c279-04ff-7497-bf53-2a4821bade03`. Provider acceptance is not recipient-open evidence. A separate inbound warning showed that one recipient address did not match an active route, so inbound routing still requires certification.
- Meta Business Login configuration `2301498587321705` was confirmed in Meta and stored as `META_BUSINESS_LOGIN_CONFIG_ID` in Netlify for all deploy contexts. No deploy was performed, so the new runtime configuration is not claimed active yet.
- The owner-attention regression caught by the release gate was repaired: `needsOwner` events now flow into the Needs Attention `doFirst` list, with duplicate urgent cards removed.
- A paired-device log exposed a stale Ferocity Connect status event retrying a final/missing SMS job. The API now idempotently acknowledges late final callbacks, and Android 1.0.2 discards only permanent 400/404/409/410 outbox responses while retaining authentication, rate-limit, network, and server failures for recovery. Android 1.0.2 was built, release-signed, SHA-256 verified (`ADF24D666794CF42460561B39A08D481DFB2F72D4F97F30213F6FE4B50DF0D24`), uploaded, and published as version code 3 at `android/3/Ferocity-Connect-1.0.2.apk`. Existing paired devices still need to install the update.
- The in-product Feature Readiness board now distinguishes configured credentials from certified live execution and can explicitly label capabilities unavailable instead of implying they work.
- Migrations 218 and 219 were applied directly through the controlled migration runner. A second validation found zero pending migrations. This did not deploy the frontend or Netlify functions.
- A second no-deploy backend certification passed provider and capability truth, all 14 provider lanes, tenant RLS, public claim/data guards, 42 integrated workflows, Authority Engine, Office Manager, AI command routing, labor intake, receptionist accounting, review recovery, failure isolation, production render/canonical checks, and platform capacity. Platform capacity was healthy at 12/60 database connections with no due actions, recent failures, errors, or active alerts.
- Stripe's live configuration was rechecked across all seven prices. A real live-mode Checkout Session was created and immediately expired without payment, proving checkout creation without charging a customer.
- Unit-economics checks remain positive in the modeled heavy-use case: estimated gross margin is 78.82% for Starter, 78.15% for Growth, and 73.37% for Operator under the documented cost assumptions. These are planning estimates, not guarantees; provider-price changes still require review.
- Jobber's stored access token is expired and its refresh attempt returns HTTP 401. The connection must be reauthorized before any Jobber sync; live actions remain off. Provider refresh errors now include the provider reason or HTTP status instead of a generic failure.
- The credential-health audit now records provider-account status alongside each sealed credential, preventing future maintenance reports from confusing dormant credentials with operational connections.
- A direct Netlify/Vonage check confirmed that the four expected Vonage variables are not populated with usable account values; an attempted credential-only balance check was rejected as unauthorized. Ferocity continues to report Vonage as unavailable and live sends stay disabled. The adapter now accepts either `VONAGE_FROM_NUMBER` or the legacy `VONAGE_SMS_FROM` name, and provider readiness explicitly audits Vonage instead of silently omitting it.
- A live synthetic AI-quality evaluation exposed and repaired two issues: electrical/water field notes now deterministically create a high safety escalation that tells unqualified people not to inspect or touch the hazard, and growth-funnel prompts explicitly require array-shaped plans. The corrected field-log and growth-funnel cases both pass; the full seven-case evaluation has passing evidence across the finishing run. The test suite now contains 570 passing tests.
- The final optimized production build completed successfully after these repairs and generated all 107 static pages. The only build warning is the known dynamic dependency warning inside `unpdf`; it did not prevent compilation, TypeScript validation, page generation, or trace collection.

## Exact next-deploy order

1. Review the staged diff and database rollback readiness; migrations 218 and 219 are already applied.
2. Deploy the backend/frontend once, including the staged Meta environment value.
3. Run health, login/signup/password recovery, first-session Ferocity Chat, billing, support, mailbox, receipt, messaging, phone, publishing, and tenant-isolation certification checks.
4. Keep every provider action downgraded to approval, setup, or unavailable until its exact live check passes.

## Remaining owner/provider boundaries — not engineering placeholders

These are the only items this finishing pass cannot truthfully complete without a specific external decision or interaction:

- **Frontend/backend deployment:** explicitly withheld. Migrations 218/219 are applied, but the new Netlify runtime/frontend behavior remains undeployed.
- **Vonage production credentials:** the approved account is at its login screen, but usable API credentials are not stored. Login/API-key creation is an external persistent-access action. Once authenticated and confirmed, store the credentials server-side, select/register a sender, configure signed delivery/inbound webhooks, fund/register the route where required, and run one consented test.
- **Retell human transfer:** Ferocity cannot guess the transfer destination. Each tenant must explicitly supply and verify its own transfer number; until then the agent captures a callback instead of falsely claiming to transfer.
- **Real money certification:** the QA loop is complete, but a genuine low-dollar subscription/payment/failure-or-refund/reconciliation journey requires an intentionally authorized charge.
- **Customer-owned Google/Microsoft/Jobber accounts:** Ferocity can provide the adapters and OAuth flow, but it cannot manufacture customer authorization. Each tenant must connect and revoke its own account.
- **Post-deploy proof:** mailbox sync, receipt intake, app/chat UX, inbound routes, public publishing, and tenant isolation must be exercised against the released code, not certified from an undeployed build.

## Internal portfolio activation — 2026-09-21

- The production account already had the intended separation: a global Platform Admin identity, an active `Internal Portfolio` workspace, isolated customer workspaces, and an isolated `Ferocity QA Demo` workspace. No duplicate administrative tenant was created.
- The Internal Portfolio contains six active owned brands: 4bid, MarketplacePro, Preferred Trailer Rental, Homes4Rent, Storm Restoration, and Ferocity.
- Every portfolio brand now has a Marketing OS business profile and an active organic-first growth objective. All six remain in `suggest` authority, paid spend is not authorized, and no publishing was triggered.
- The AI Growth Department refreshed evidence-led recommendations across the portfolio. These recommendations expose the real setup gaps—services/offers, service areas, proof, tracked lead capture, follow-up, and source-to-revenue attribution—instead of pretending the brands are ready for unattended distribution.
- The app source now labels workspace context explicitly as Internal Portfolio, Customer workspace, or another workspace type, and separately labels Platform Admin access. This UI clarification requires the next deliberate frontend deployment.
