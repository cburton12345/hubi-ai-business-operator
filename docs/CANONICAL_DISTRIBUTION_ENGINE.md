# Ferocity Canonical Distribution Engine

## Outcome

Ferocity now has one provider-neutral publishing model for ads, organic posts, listings, promotions, job posts, service offers, email, SMS, and webpages:

`CREATE ONCE -> CHOOSE WHERE -> ADAPT -> APPROVE -> PUBLISH -> COLLECT -> MEASURE`

This extends the existing Growth Distribution Engine, provider connection lanes, content-quality checks, publishing queue, attribution events, organic cadence, and provider adapters. It does not replace those systems.

## Core objects

- `distribution_publications`: the canonical business intent and content. It is not shaped like a Meta, Google, TikTok, email, or SMS request.
- `distribution_destinations`: one adapted plan per destination, including its provider, method, preview, capability snapshot, attribution, status, errors, and idempotency key.
- `distribution_attempts`: an immutable operational history for publish/update/pause/remove/status/analytics work.
- `distribution_asset_variants`: destination-specific media variants derived from a source asset.
- `distribution_inbound_events`: replies, leads, comments, messages, delivery events, provider warnings, and analytics routed back to Ferocity.
- `publishing_queue`: remains the execution queue. It now links back to the canonical publication and destination plan.

The TypeScript capability registry and planner live in `src/lib/growth/canonical-distribution.ts`. Persistence and attempt recording live in `src/lib/growth/distribution-service.ts`. Database changes live in migration `225_canonical_distribution_publishing_engine.sql`.

## Destination truth

Each destination declares:

- supported publication types;
- provider key and available execution methods;
- connection requirements;
- whether scheduling, recurring work, updates, removal, inbound events, and analytics are supported;
- media sizes/aspect ratios and text limits;
- provider restrictions;
- whether explicit spend approval is always required.

The planner never equates a login with authorization. For example:

- TikTok login, TikTok content publishing, and TikTok advertising use separate provider keys.
- Paid channels require a budget and explicit spend approval, even when a connector is live.
- Assisted or manual destinations return `needs_human`; they are never reported as published just because a draft or browser page exists.
- “Publish everywhere supported” selects only destinations that support that publication type. It does not spray content into incompatible channels.

## Adapter contract

Provider code continues to implement the existing `GrowthDistributionConnector` boundary. A worker should:

1. claim a `publishing_queue` row;
2. read its linked `distribution_destination` and capability snapshot;
3. execute only through the registered provider adapter and authorized tenant identity;
4. write a `distribution_attempts` record;
5. update the destination and queue status with the provider reference or actionable failure;
6. schedule bounded retry only for retryable failures;
7. ingest provider webhooks/replies into `distribution_inbound_events` and existing CRM attribution.

No provider SDK belongs in business-planning code. Adding destination #50 should normally require:

1. a capability definition;
2. an adapter implementing the connector boundary;
3. credential/OAuth and health registration in the existing connection architecture;
4. payload/preview tests and one live certification test;
5. provider-truth metadata and documentation.

It should not require changing the canonical publication tables or core planner.

## Approval, money, and safety

- Draft-first, approval-required, policy, and autopilot modes are represented on the canonical object.
- Existing tenant policies still decide whether an eligible action can execute.
- Paid spend cannot be inferred from general autopilot. It requires a declared budget plus explicit spend approval.
- Compliance, consent, suppression, community rules, account health, rate limits, and provider policy remain adapter/runtime gates.
- Idempotency keys are stable per canonical content, destination, campaign, and schedule. They prevent duplicate queueing/provider calls.
- Retries use bounded exponential backoff and preserve the original request/result trail.
- Provider-specific adaptation never overwrites the canonical source.

## Media adaptation

Destination records carry media requirements and `distribution_asset_variants` records carry the generated output. A media worker may resize, crop, transcode, caption, or create thumbnails, but must preserve the original asset and record provenance. Unsupported media must block that destination with a useful reason rather than silently degrade it.

## Attribution and learning

Every adapted CTA receives destination-specific UTM values. External references, inbound events, and analytics remain tied to the canonical publication and destination. Existing Growth attribution can therefore compare channels through lead, estimate, job, invoice, payment, review, repeat business, and profit outcomes—not clicks alone.

## Product experience

The Publishing Hub should expose the workflow in this order:

1. What are you promoting or publishing?
2. What outcome is wanted?
3. Where should Ferocity distribute it? Include “everywhere appropriate.”
4. Show channel-specific previews, limitations, connections, budget, and approvals.
5. Schedule once or recur where permitted.
6. Show each destination independently: ready, needs approval, needs connection, needs human, queued, live, failed, or removed.
7. Route replies/leads to the shared inbox/CRM and compare business results.

Ferocity may recommend destinations and prepare variants, but it must explain why, expose cost, and preserve owner control.

## Current provider mapping

- Organic/owned: website, Google Business Profile, Facebook, Instagram, TikTok content, LinkedIn, Reddit, Nextdoor.
- Paid: Google Ads, Meta Ads, TikTok Ads, Microsoft Ads.
- Direct: email and SMS (including compliant provider or Ferocity Connect routing according to existing SMS policy).
- Fallback: manual export or assisted browser work with honest status.

Readiness is dynamic. The registry says what a provider can theoretically support; provider lanes and credentials say what the tenant can actually do now.

## Release checklist (not performed in this change)

- Apply migration 225 in a preview/staging database and run migration/RLS validation.
- Add the queue worker integration for each already-certified live adapter.
- Verify previews and live provider payloads with test accounts.
- Verify inbound event deduplication and CRM attribution.
- Run full test, typecheck, lint, build, provider truth, capability truth, and predeploy checks.
- Deploy only after owner approval; then run post-deploy smoke tests.

No frontend or production deployment was performed while implementing this engine.
