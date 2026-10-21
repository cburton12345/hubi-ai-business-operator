# Ferocity production release — 2026-10-04

## Deployment

- Netlify production deploy: `6ac33eca7152ff76e967a274`
- Final capability-truth/documentation deploy: `6ac3405a42871641293307c2`
- Production URL: `https://ferocity.live`
- Unique deploy URL: `https://6ac33eca7152ff76e967a274--ferocityflo.netlify.app`
- Final unique deploy URL: `https://6ac3405a42871641293307c2--ferocityflo.netlify.app`
- No database migrations were pending or applied during this release.
- The complete predeployment gate passed: public/provider/capability/UI/integration guards, migration validation, 198 Vitest files / 745 tests, 7 Marketplace worker tests, TypeScript, ESLint and the optimized production build.
- The existing non-fatal `unpdf` dynamic-dependency build warning is unchanged.

## Production certification

- Public home, health, Ask Ferocity, pricing and Ferocity Connect routes returned HTTP 200.
- Customer-path smoke passed workspace creation, invite/source/form seeding, business grading, lead and owner-event persistence, removed-plan denial, Stripe checkout creation and immediate expiration without payment, and complete cleanup.
- Public chat smoke passed lead capture, two-way conversation persistence, guarded human handoff, owner event and cleanup.
- Authenticated Ferocity QA Demo loaded 27 expense documents with eight cards per page and `Page 1 of 4` navigation.
- Approval Queue at 390x844 rendered the deployed responsive empty state without a table or horizontal overflow.
- The deployed Netlify mailbox background function completed a real Microsoft read-only sync: 10 messages seen, 10 normalized/upserted, send authority disabled, no retained error.
- Customer integration disconnect is now atomic across credential erasure, connection state, provider lanes, routing, queued work and mailbox access. Regression coverage passed before deployment.

## Deliberately deferred

- TikTok Content Posting certification and TikTok Ads approval remain deferred. Do not mark either live based on TikTok Login Kit.
- Meta Marketplace/customer publishing certification remains deferred. Do not mark it live based on the existing Meta business/app configuration.

## Exact remaining physical/provider blockers

- Ferocity Connect retains earlier Android 16/Verizon delivered and inbound evidence, but the paired device stopped heartbeating during this release session. No previously delivered destination matched a current granted-consent record, so no uncertain or non-consented certification text was sent. Reopen/update the paired Android app and explicitly identify the consented certification destination before the delayed-send, STOP/START/HELP, offline/recovery and replacement matrix can be closed.
- Retell is connected, configured, inbound-routed and callback-certified, but the production tenant has no verified human-transfer destination and the Retell transfer tool is therefore absent. Configure a verified E.164 human destination, resync the agent, then complete one inbound and one consented outbound human test.
- Customer-side Gmail remains a connect-account path. Microsoft read-only mailbox sync is production-certified; mailbox sending remains intentionally separate and unreleased.

## Capability truth after release

- Expense/document intelligence: production-certified within its review and accounting-disclaimer boundaries.
- Read-only mailbox monitoring: production-certified for a connected Microsoft account; other customer accounts remain connection-dependent.
- Customer revocation: deployed and atomically regression-tested; destructive live revocation of a real customer grant was intentionally not used as a smoke test.
- Ferocity Connect and scheduled SMS: source-ready with earlier physical evidence; final current-device certification remains open for the blocker above.
- TikTok publishing and Facebook Marketplace: source-ready but explicitly deferred by the owner for this release.
