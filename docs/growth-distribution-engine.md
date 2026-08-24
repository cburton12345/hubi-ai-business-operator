# Ferocity Growth & Distribution Engine

## Product contract

Ferocity starts with the business result: service, geography, lead/revenue/job target, time horizon, budget, channels, and authority. Channels are delivery surfaces. The existing Growth Operator remains the system that connects content, publishing, follow-up, reviews, attribution, leads, jobs, and revenue.

The engine follows three rules:

1. Use official provider APIs when the provider grants the required access.
2. Use an explicit assisted or manual path when an official capability is unavailable.
3. Never label account setup, funding, OAuth scaffolding, or a draft as a live executable integration.

## Existing systems reused

- `brands`, `brand_services`, and `brand_locations` remain the business context.
- `growth_sources` and `growth_attribution_events` remain the attribution model.
- `publishing_queue` remains the content scheduling/review queue.
- `provider_accounts` remains the provider-account record.
- `live_action_policies` and `outbound_action_queue` remain the outbound safety boundary.
- `approvals` remains the human-decision queue.
- `leads` remains the CRM entry point. A growth opportunity converts into a normal lead with source and scoring provenance intact.
- `operator_timeline_events` remains the unified operational history.

No duplicate CRM, campaign, provider credential, approval, or attribution system was introduced.

## New domain records

- `growth_objectives`: outcome-first growth goals and their default authority.
- `growth_distribution_identities`: legitimate customer-owned pages, accounts, profiles, groups, listings, and mailboxes. Credentials remain in the existing provider vault/account systems, not this table.
- `growth_communities`: community relevance, geography, rule provenance/freshness, posting policy, removals, engagement, leads, and revenue context.
- `growth_opportunities`: expressed demand with source provenance, intent/geography/objective scoring, suggested response, risk flags, and optional conversion to an existing lead.
- `growth_autonomy_scopes`: overrides by brand, objective, identity, community, channel, and action.
- `growth_action_attempts`: risk and delivery history linked to the existing outbound queue.
- `growth_policies`: one policy surface for rollout, objectives, geography, brand voice, claims, channels, communities, identities, actions, posting windows, risk, and follow-up.
- `growth_contact_identities`: channel-specific identities linked to existing leads, customers, and conversations only with recorded confidence and provenance.
- `growth_events`: immutable structured activity with raw provider context, idempotency, outcome, failure, owner intervention, model, prompt, and strategy dimensions.
- `growth_strategy_versions`: historical scoring, prompt, model, and strategy configuration.
- `growth_attribution_touches`: first, assisting, last, and conversion touches across objective, community, action, conversation, lead, estimate, job, invoice, pipeline, and won revenue.
- `growth_connector_sessions`: expiring, revocable, device-bound, scope-bound assisted-connector sessions. Only a token hash is stored.

## Authority and safety

Authority is `suggest`, `approve`, or `autopilot`. Autopilot is permission, not a promise to execute. An action can run only when the connector capability, provider authorization, community policy, verified identity, live-action policy, consent requirements, content review, and current health all allow it.

Risk states are:

- `healthy`
- `caution`
- `throttled`
- `verification_required`
- `restricted`
- `cooldown`
- `disabled`

Thresholds are customer/provider data, not made-up universal posting limits. A provider checkpoint stops the affected identity and asks the legitimate owner to complete it. It is not treated as punishment and Ferocity never attempts to bypass it. Resumption is cautious and does not dump a backlog.

Prepared public content is screened for unsupported claims such as guarantees, licensing, certification, prices, availability, warranties, customer counts, or performance. A flagged response is blocked for review unless the relevant business claim was supplied as verified context.

## Capability truth

The UI reports each operation as `official`, `assisted`, or `manual`. Initial channel definitions cover Website, Google Business Profile, Facebook, Instagram, Reddit, LinkedIn, X, Nextdoor, Craigslist, email, and SMS.

Current definitions are deliberately conservative:

- Ferocity-hosted website publishing, configured email delivery, and compliant connected SMS have executable paths through existing systems.
- Google Business Profile read/reporting foundations exist; publishing and replies remain review-first until certified.
- Facebook and Instagram use legitimate customer-owned identities with assisted/manual work unless the required Meta permissions are approved and certified.
- Reddit, LinkedIn, X, Nextdoor, and Craigslist default to rules-aware manual packages until a supported customer-owned connector is enabled.
- Personal social profiles do not receive unattended posting authority.

Provider-specific selector/browser plumbing must stay isolated from Growth business logic. The core engine consumes normalized capabilities and action results only.
`GrowthDistributionConnector` is that boundary. Thin official adapters and assisted browser connectors return the same normalized result. An assisted handoff returns `needs_human`; opening a page or preparing a draft is never recorded as a successful publish.

Each channel profile separately reports official, assisted, manual, and unsupported capabilities plus authentication, inbound events, approval requirements, risk constraints, and health source. Business logic asks the connector boundary for a capability; it does not branch on Meta, Reddit, Google, or another provider.

### Facebook

The current Facebook implementation is a safe assisted connector foundation, not an invented official publishing API. It:

- uses legitimate customer-owned identities;
- reports assisted actions as `needs_human`, never as published;
- separates Page, Group, and Messenger surface interpretation;
- pauses on verification or platform warnings;
- reports unknown UI as connector incompatibility instead of clicking blindly;
- keeps normalized Growth logic separate from DOM interpretation;
- uses short-lived, device-bound, scope-bound Ferocity connector sessions with hash-only token storage.

Actual browser selectors and navigation execution must live in the connector client and be certified against a controlled account. Facebook-specific H4R rental behavior remains separate.

## Opportunity flow

1. An official feed, assisted review, or owner-provided source yields a source URL and relevant excerpt.
2. Ferocity scores expressed intent, service fit, geography, and objective fit.
3. A proposed response is checked for unsupported claims and kept in review.
4. `Send to approval` creates an existing `outbound_action_queue` record, a linked growth action attempt, and an existing `approvals` record. Nothing is posted at this point.
5. `Move to Leads` creates a normal Ferocity lead and an attribution event. Consent remains false until actually established.

Inbound connector events use the existing provider-independent messaging tables. The normalized ingestion path creates or updates the existing conversation, stores the inbound message idempotently, preserves the channel identity without aggressively merging it, scores the opportunity, and records the raw Growth event. A verified phone/email or explicit owner/customer confirmation can link identities; name similarity alone cannot auto-merge.

## Rollout and feature flags

The existing `workspace_feature_entitlements` gate controls `growth_distribution_engine`. The default policy begins at Stage 1:

1. Observe and discover only.
2. Generate suggestions and opportunities.
3. Owner-approved actions.
4. Safe limited autopilot.
5. Broader policy-controlled autopilot.

Rollout stage limits authority even if a narrower scope asks for more. Personal social identities are suggestion-only. No connector is required to reach Stage 5.

## Event and learning contract

Raw structured events are retained instead of relying on counters. Instrumentation covers objective/community/opportunity/content/publish/engagement/lead/approval/connector/verification/restriction/conversation/estimate/job/customer/revenue events. Strategy, scoring, prompt, model, automation mode, outcome, failure, owner intervention, campaign/content references, and attribution dimensions are stored with the event.

This supports later controlled analysis of qualified leads and profitable revenue. It does not enable uncontrolled experimentation or optimize for vanity metrics.

## Connector certification still required

These are operational/provider tasks, not missing core architecture:

- Obtain and verify provider developer access and production scopes per channel.
- Implement thin adapters against the normalized capability contract.
- Certify webhook signatures, idempotency, pagination, rate-limit handling, token refresh, provider delivery/error mapping, and disconnect behavior.
- Run a real customer-owned test identity through suggestion, approval, execution, failure, verification, cooldown, recovery, attribution, and audit-history scenarios.
- Promote only the individually tested capability from assisted/manual to official.

The platform must keep working when any one channel is disconnected, restricted, or unavailable.

## Manual dogfood checklist

1. Confirm the `growth_distribution_engine` entitlement is enabled at rollout Stage 1.
2. Add the normal Ferocity business/brand and a legitimate primary or distribution identity.
3. Complete provider authorization directly with the provider and verify the identity health record.
4. Create a plain-English Growth objective with service, geography, target, timeframe, and authority.
5. Add one relevant community and record its rule source and freshness.
6. Capture or ingest one controlled opportunity and review scoring/provenance.
7. Prepare one contextual response and send it through the existing approval queue.
8. Approve one low-volume controlled action; do not mass post.
9. Confirm Growth events, outbound queue history, provider result, and timeline records.
10. Convert the resulting interest to the existing Leads system and confirm the first-touch attribution record.
11. Link a second channel identity only with verified contact evidence; confirm weak name similarity remains review-only.
12. Simulate connector offline/unknown UI and confirm the action remains recoverable.
13. Set `verification_required`; confirm only that identity pauses and the owner-facing message directs verification to the platform.
14. Clear verification into cooldown, allow one cautious health check/action, then confirm recovery to healthy without backlog dumping.
15. Advance rollout to Stage 2 or 3 only after reviewing the evidence. Stage 4 requires a certified official capability and healthy identity.

## Release state

Migrations `189_growth_distribution_engine.sql`, `190_growth_learning_identity_and_events.sql`, and `191_facebook_assisted_connector.sql`, the Growth UI extension, capability/risk/claim/policy logic, approval bridge, inbound conversation path, safe cross-channel identity model, lead conversion, multi-touch attribution, versioned events, scoped connector sessions, Facebook assisted boundary, and automated tests are implemented locally. No frontend or production deployment was performed as part of this work.

### Facebook controlled-loop implementation

The dogfood browser client is in `connectors/facebook-assisted`. It is intentionally visible and review-first:

- an owner/admin explicitly enables a controlled test and creates a single-use, 10-minute code from the Facebook identity;
- pairing material and connector bearer tokens are stored server-side as hashes only, and the device-bound token expires after 12 hours;
- the user explicitly selects Facebook text to capture, so there is no continuous hidden feed scraping;
- capture flows into the existing idempotent conversation, opportunity, scoring, identity, and attribution records;
- response work uses the existing high-risk approval and outbound queue;
- the connector can claim only work approved for its exact tenant and identity while health is good and controlled Stage 3 is enabled;
- the connector copies prepared text and opens the legitimate destination; it does not use fragile automatic posting clicks;
- success is recorded only after the user confirms that the real Facebook action completed;
- verification, restriction, unknown UI, cooldown, expired session, and failure signals stop claims and update existing identity health.

This is dogfood-ready code, not public Facebook automation certification. Before wider release, apply migration 191 in a non-production environment, load the unpacked extension, complete the full controlled loop on a test identity, test duplicate capture and warning/verification paths, and inspect the audit trail.
