# Closed-Loop Growth Operating System audit

Date: 2026-09-21

This audit treats the two-part specification as additive. Existing Ferocity systems remain authoritative where they are stronger or already integrated. No parallel CRM, conversation, job, payment, scheduling, attribution, content, proof, or automation platform was introduced.

## Classification key

- **Strong existing**: useful production-shaped capability already exists and should be extended, not replaced.
- **Foundation added**: this pass added the missing shared model or controller layer.
- **Partial / extend**: meaningful capability exists, but the complete behavior in the specification needs more iteration or real-world evidence.
- **External / roadmap**: depends on provider approval, credentials, platform policy, or a later integration; Ferocity must show this truthfully.

## Capability matrix

| # | Capability | Classification | Ferocity path / decision |
|---:|---|---|---|
| 1 | Business objective engine | Foundation added | Existing `growth_objectives` now carries collected cash, gross profit, unit economics, margin floors, CAC/ROAS limits, capacity and backlog constraints. |
| 2 | Reverse revenue planning | Foundation added | Deterministic, tested planner works backward from collected cash through the funnel, labels assumptions, supplies ranges and checks capacity/economics. |
| 3 | Market intelligence | Partial / extend | Growth opportunities, SEO signals, conversation intelligence, weather demand and marketing memory exist; structured market snapshots and refresh policy can be deepened. |
| 4 | Voice of customer | Foundation added | `growth_voc_signals` preserves source, excerpt, normalized insight, confidence, evidence and review state; ingestion automations remain an iterative expansion. |
| 5 | ICP engine | Foundation added | Structured ICP profiles complement the existing Marketing OS profile rather than replacing it. |
| 6 | Ideal job profile | Foundation added | Structured job value, margin, geography, capacity and qualification criteria added. |
| 7 | Offer engine | Foundation added | Versioned offers link ICP, ideal job, proof requirements, price/margin boundaries and prior versions. |
| 8 | Offer intelligence | Partial / extend | Existing campaign learning and attribution can evaluate offers; automatic offer-score rollups need field evidence and thresholds. |
| 9 | Positioning engine | Partial / extend | Business profile, brand voice, audience research and Marketing Memory exist; structured positioning versioning should use offer/ICP evidence. |
| 10 | Channel strategy | Strong existing | Growth channel catalog, capability truth, identities, communities, policies, account risk and connector state already exist. |
| 11 | Campaign model | Strong existing | Content Studio campaigns, recommendations, publishing queue, sources and attribution are canonical. |
| 12 | Creative strategy | Strong existing | AI content production creates evidence-backed audience/message hypotheses and platform-specific concepts. |
| 13 | Creative production | Strong existing | Content, media, UGC, image/video provider abstraction, approval and publishing systems already exist. |
| 14 | Creative variants | Strong existing | Existing variants extended with lineage, concept key and lifecycle state. |
| 15 | Creative fatigue | Foundation added | Fatigue/lifecycle fields added; reliable automatic detection needs sufficient live performance volume. |
| 16 | Funnel engine | Strong existing | Leads, qualification, appointments, estimates, jobs, invoices and payments are linked through existing Revenue Growth records. |
| 17 | Landing-page intelligence | Partial / extend | Content outputs, forms, SEO and attribution exist; automated experiment decisions need more conversion volume. |
| 18 | VSL engine | Partial / extend | Scripts and video generation exist; full multi-scene assembly and performance learning remain provider/cost dependent. |
| 19 | Dynamic qualification | Strong existing | Qualification forms/questions and lead scores exist. |
| 20 | Qualification friction | Partial / extend | Funnel events support measurement; explicit per-question abandonment instrumentation needs expansion. |
| 21 | Qualification actions | Strong existing | Scores, recommended actions, sequences and approvals already connect qualification to follow-up. |
| 22 | AI lead concierge / SDR | Strong existing | Messaging, AI workforce, Retell and lifecycle workflows provide the execution layer under permissions. |
| 23 | Speed-to-lead | Strong existing | Lead events and follow-up orchestration exist; provider truth and tenant authority remain required. |
| 24 | Booking and show-rate | Strong existing | Revenue appointments, confirmations, reminders, status and no-show workflows already exist. |
| 25 | Canonical growth events | Strong existing | `growth_events` is the shared event spine. |
| 26 | Attribution | Strong existing | Growth touches plus Revenue Growth attribution connect source through collected cash and profit fields. |
| 27 | Downstream conversion feedback | Strong existing | Provider-neutral conversion event queue exists; each ad provider still needs supported credentials/capabilities. |
| 28 | Adaptive optimization event | Partial / extend | Organic winner evaluation and marketing memory exist; thresholds must remain evidence- and sample-size-aware. |
| 29 | Local Services Ads | External / roadmap | No claim of live automation until Google access and supported APIs are verified; manual/export boundary is appropriate. |
| 30 | Direct booking / partner roadmap | External / roadmap | Existing integration registry/action layer is the correct boundary; partner-specific certification remains separate. |
| 31 | Proof library | Strong existing | Reviews, UGC, approved media and `/app/proof` already exist. |
| 32 | Reputation and review engine | Strong existing | Review request workflows, consent-aware messaging and proof reuse are present. |
| 33 | Evidence-driven creative | Strong existing | Content generation already requires supplied evidence and blocks invented claims. |
| 34 | Experiment engine | Foundation added | Existing ad experiments now support hypotheses, primary/secondary/guardrail metrics, observation thresholds and decisions. |
| 35 | Growth memory | Strong existing | Tenant-scoped Marketing Memory and lifecycle learning exist with evidence/confidence. Cross-tenant learning remains aggregated and gated. |
| 36 | Retargeting / lifecycle audiences | Partial / extend | Lifecycle states and provider-neutral conversion queue exist; external audience sync is provider-specific. |
| 37 | Sales conversation intelligence | Partial / extend | Conversations, calls/transcripts, summaries and customer lifecycle data exist; coaching scorecards can deepen. |
| 38 | Lost opportunity intelligence | Strong existing | Lost/not-yet/no-response sequences and memory signals exist. |
| 39 | Separate lead quality from sales performance | Partial / extend | Qualification and downstream outcomes are separate records; UI reporting can make the distinction more explicit. |
| 40 | AI sales coach | Partial / extend | AI recommendations and conversation context exist; calibrated coaching benchmarks need real samples. |
| 41 | Lead response orchestration | Strong existing | Context-aware follow-up, channel selection, stop conditions, approvals and lifecycle recovery are implemented. |
| 42 | Identity resolution | Strong existing | Contact identities and canonical customer/lead records exist; deterministic matches stay preferred over guesses. |
| 43 | Consent / communication permission | Strong existing | Consent and opt-out checks exist in communication workflows and provider lanes. |
| 44 | Autonomy levels | Strong existing | Suggest/approve/autopilot, live-action policies, approvals and action audit trails exist. |
| 45 | Budget guardrails | Partial / extend | Budget modes and approval requirements exist; objective-level CAC/ROAS constraints were added. Paid increases remain approval-only. |
| 46 | Capacity-aware growth | Foundation added | Controller constrains demand when capacity is full and exposes target/capacity conflicts. |
| 47 | Geographic profitability | Partial / extend | Locations, jobs and attribution provide inputs; explicit area-level cost/profit rollups need more implementation. |
| 48 | Weather / event-responsive growth | Strong existing | Weather demand signals, recommendations and notifications already exist. |
| 49 | Competitor intelligence | Partial / extend | Memory supports competitors/changes, but no facts may be invented; verified collection and refresh remain required. |
| 50 | Organic / community discovery | Strong existing | Community intelligence, rules freshness, assisted connector, approvals and safe posting cadence exist. |
| 51 | Content engine | Strong existing | Audience-informed content packages, quality review, brand context and publishing queue exist. |
| 52 | Content atomization | Partial / extend | Multi-format output exists; source-to-derivative lineage should continue through variant keys and campaigns. |
| 53 | Referral engine | Partial / extend | Customer/lifecycle messaging can support referrals; a specialized incentive/accounting model remains future work. |
| 54 | Reactivation engine | Strong existing | Context-aware lifecycle recovery and past-customer sequences exist. |
| 55 | Profit-weighted acquisition | Foundation added | Objective economics and controller can block unsafe expansion; job-cost completeness determines confidence. |
| 56 | Forecast before spending | Foundation added | Reverse plan estimates funnel volume, acquisition spend, contribution and ROAS; no paid spend is changed automatically. |
| 57 | Owner Command Center growth briefing | Partial / extend | Timeline/notifications/recommendations exist; controller snapshots now supply concise reasons and directive for the briefing UI. |
| 58 | Explainable AI actions | Strong existing | Recommendations preserve evidence, reason, next step, confidence and authority. |
| 59 | Kill switch / rollback | Strong existing | Provider/account/automation states, policy gates, pause/revoke paths and audit history exist. |
| 60 | AI workforce architecture | Strong existing | Specialized roles share an orchestrated business action/evidence layer rather than pretending to be isolated people. |
| 61 | Ferocity Connect / bring-your-own agent | Strong existing | Provider-neutral business action layer and MCP/connector architecture exist under tenant identity, permissions and auditing. |
| 62 | Model / provider routing | Strong existing | AI service/model routing and provider registry exist; provider-specific logic stays behind abstractions. |
| 63 | Marketing as closed-loop controller | Foundation added | Daily Growth sweep now computes controller snapshots before the AI Growth Department chooses actions. |
| 64 | Cross-module intelligence | Strong existing | Growth reads brand, leads, conversations, jobs, invoices, payments, proof, SEO, weather and memory; new structured evidence joins that snapshot. |
| 65 | Opportunity detection | Strong existing | Growth opportunities, SEO opportunities, weather demand and lifecycle recommendations exist. |
| 66 | Anomaly detection | Partial / extend | Workflow/provider health and warnings exist; broader statistical business anomaly detection needs calibrated baselines. |
| 67 | Data quality / attribution health | Foundation added | Controller computes conservative completeness and attribution coverage, and emits `repair_data` instead of pretending certainty. |
| 68 | Tracking / UTM governance | Partial / extend | Sources, campaign keys, landing pages and attribution records exist; centralized naming enforcement can be tightened. |
| 69 | First-party data strategy | Strong existing | Canonical tenant-owned events, attribution, conversations, operational records, proof and memory remain Ferocity-owned and provider-neutral. |

## What this pass changed

1. Extended growth objectives with collected-cash, profit, margin, CAC, ROAS, capacity and backlog constraints.
2. Added a tested reverse-revenue planner with confidence, ranges, explicit assumptions and capacity/economic warnings.
3. Added structured, tenant-scoped ICP, ideal-job, offer and voice-of-customer records with provenance.
4. Added closed-loop controller snapshots and deterministic `expand`, `hold`, `constrain` and `repair_data` decisions.
5. Fed the controller and new structured evidence into the existing AI Growth Department daily sweep.
6. Extended existing experiment and creative tables instead of creating parallel systems.
7. Preserved the rule that paid spend is never increased automatically.

## Deliberately not overwritten

- Existing Growth Department recommendations and Marketing Memory
- Existing Content Studio and publishing queue
- Existing proof, UGC and review systems
- Existing lead/customer/conversation records
- Existing jobs, estimates, invoices, payments and job-costing
- Existing attribution/event spine
- Existing authority, approvals, consent, audit and provider truth controls
- Existing connector, MCP and BYO-agent architecture

## Honest remaining work

The new foundation is complete locally, but production evidence is needed before several partial capabilities can be called mature. The next coherent phase is to surface controller snapshots in the owner briefing, add CRUD/review flows for ICP/offers/VOC, and calibrate experiment/fatigue/anomaly thresholds using real tenant data. Provider-dependent capabilities must remain visibly unavailable or manual until credentials, approval and live certification exist.

No frontend or production deployment was performed in this pass.
