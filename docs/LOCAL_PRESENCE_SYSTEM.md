# Ferocity Local Presence + Local SEO

## What this adds

Ferocity now has a provider-neutral local-presence control plane instead of treating Google Business Profile as a disconnected integration. Google is the first live adapter. Apple Business Connect, Bing Places, directories, and review platforms are represented in the same capability-aware distribution model without claiming automation that is not implemented.

The system covers:

- canonical business data versus each provider's live profile;
- profile health, completeness, consistency, freshness, and actionable issues;
- governed profile updates with explicit approval for public changes;
- selected Ferocity/Connect phone-number recommendations, while keeping phone changes approval-gated;
- review synchronization, compliant review-request workflows, configurable negative-review routing, and owner-opted-in positive replies;
- real Google performance metrics and monthly search-query data;
- real operational events such as completed jobs feeding the Publishing Hub;
- provider-specific status, retries, attribution, and delivery truth through the canonical Distribution Engine.

The operator UI is at `/app/local-presence`. The existing `/app/integrations/business-profile` page remains the connection and location-selection surface.

## Architecture

`canonical business data -> local_presence_profiles -> provider adapter -> issues/reviews/performance -> local_presence_events -> canonical distribution -> attribution and learning`

Key modules:

- `src/lib/local-presence/engine.ts` — pure health, policy, review, and event decisions.
- `src/lib/local-presence/provider.ts` — provider-neutral adapter contract and Google implementation.
- `src/lib/local-presence/google-sync.ts` — Google snapshot, metrics, queries, review actions, and governed writes.
- `src/lib/local-presence/events.ts` — idempotent operational signals suitable for local content.
- `src/lib/growth/canonical-distribution.ts` — shared destination capabilities and content adaptation.
- `supabase/migrations/226_provider_neutral_local_presence.sql` — tenant-scoped data model, policies, RLS, and indexes.

## Safety and policy rules

- No fake reviews, review incentives, keyword stuffing, fabricated activity, or ranking guarantees.
- Public phone, identity, category, and service-area changes are never silently guessed.
- Positive review auto-replies require explicit owner opt-in. Negative, ambiguous, or rating-only reviews are routed according to owner policy.
- Completed work becomes a candidate event, not an invented public claim. Proof and approval still apply.
- Rank data is shown only when a reliable supported source exists; impressions are not relabeled as rankings.
- Provider capability state remains truthful: unsupported or manual destinations stay manual until a real adapter is certified.

## Google API coverage

The implementation uses the current Business Profile APIs for business information, attributes, reviews/replies, media, local posts, performance metrics, and monthly search keywords. Real-time Pub/Sub notifications are a supported next execution path, but require Google Cloud topic/configuration work and are not falsely reported as active before that setup is complete.

Official references:

- Business Profile APIs overview: https://developers.google.com/my-business
- Location/business information: https://developers.google.com/my-business/content/locations
- Attributes: https://developers.google.com/my-business/content/attributes
- Reviews and replies: https://developers.google.com/my-business/content/review-data
- Local posts: https://developers.google.com/my-business/content/posts-data
- Media: https://developers.google.com/my-business/content/upload-photos
- Performance API: https://developers.google.com/my-business/reference/performance/rest
- Notifications: https://developers.google.com/my-business/content/notification-setup
- Prohibited/restricted review content: https://support.google.com/business/answer/3474122

## Environment and provider prerequisites

No new secret names were introduced. The existing Google OAuth connection must include `https://www.googleapis.com/auth/business.manage`, the selected profile must be authorized, and the Google Cloud project must have the applicable Business Profile APIs and quota enabled.

## Deployment checklist (not executed)

1. Apply migration `226_provider_neutral_local_presence.sql`.
2. Deploy the application build.
3. Open Google Business Profile integration, refresh locations, and select the intended location.
4. Open Local Presence, save owner policy, and refresh.
5. Verify profile snapshot, reviews, search queries, and performance data against the Google account.
6. Test one approved positive review reply and one approved safe profile update on a controlled profile.
7. Test a completed-job event through the Publishing Hub before enabling any policy-controlled automation.
8. Configure Pub/Sub notifications later for near-real-time provider events; until then, scheduled/manual refresh remains the truthful behavior.

## Later adapters

Apple, Bing, directory, and review-platform destinations already fit the common profile/event/distribution contracts. Each becomes live by adding a certified adapter and capability definition, not by rewriting the Ferocity business logic or UI.
