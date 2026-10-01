# Ferocity listing syndication

Ferocity extends its canonical Distribution/Publishing Engine with a review-first rental-listing feed lane. The outcome is vacancy velocity: create a listing once, prepare broader renter-network exposure where a provider approves it, and keep prospects routed into the tenant's chosen Ferocity or H4R showing/application/waiting-list flow.

## Supported provider keys

- `zillow_network`
- `apartments_feed`
- `tenantcloud`
- `turbotenant`

These keys describe distinct provider routes. TenantCloud and TurboTenant must not be presented as equivalent to direct Zillow approval.

## Current provider availability

- Zillow replied in September 2026 that it is not accepting additional developer integrations at this time and offered to notify Ferocity if that changes.
- Treat `zillow_network` as **provider unavailable / waitlist**, not as connected, approved, or pending customer setup.
- Keep the adapter and canonical feed path available for future activation, but do not prompt customers for Zillow developer credentials or imply that Ferocity can currently publish directly to Zillow.
- Continue offering permitted alternate/manual listing routes without representing them as Zillow approval.

## Safety model

- Each Ferocity tenant receives its own random feed token.
- The plaintext token is returned once; only its SHA-256 hash is stored.
- Feed requests compare hashes server-side with a timing-safe comparison.
- Private provider address fields stay in the protected canonical payload and token-gated feed. They are not rendered on public Ferocity pages by this feature.
- Connector creation sets `provider_approved=false` and `publish_allowed=false`.
- A connected feed can prepare and expose review data, but live publication remains blocked until provider approval and an explicit owner-controlled status change.
- Provider actions are queued separately for submission, photo fixes, private-address confirmation, approval, pause, and token rotation.
- No H4R tokens, credentials, routing, SMS, payment, ledger, or notice behavior are reused or changed.

## Data flow

`canonical listing publication -> destination adapter -> readiness diagnostics -> tenant feed connector -> provider review -> owner/provider approval -> tracked renter route`

The canonical listing payload can include:

- `privateProviderFields`: `street`, `unit`, `city`, `state`, `postalCode`
- `property`: `rent`, `bedrooms`, `bathrooms`
- `media`: image assets
- `callToAction.url` or `listingUrl`: the tenant-specific renter route

Listings missing a provider address, city, state, ZIP, rent, description, photo, or renter route are skipped and reported in readiness diagnostics rather than guessed.

## Implementation

- Migration: `supabase/migrations/232_listing_syndication_connectors.sql`
- Shared service: `src/lib/growth/listing-syndication.ts`
- Token-protected feed: `GET /api/listing-syndication/[tenantId]/[provider]?token=...`
- Canonical adapters: `src/lib/growth/canonical-distribution.ts`
- Owner surface: Publishing Hub listing destinations

The XML feed is used for `zillow_network` and `apartments_feed`; JSON is returned for `tenantcloud` and `turbotenant` or when `format=json` is requested.

## Activation remaining

1. Apply migration 232 in the normal release migration flow.
2. Add an owner-only UI around `provisionListingSyndicationFeed` that displays the new token/feed URL once and requires an explicit confirmation before rotation.
3. Populate complete private listing data and renter routes.
4. Review readiness and fix skipped listings.
5. Submit each provider request only with explicit owner approval and only while that provider is accepting integrations. Zillow is currently unavailable to new developers and should be rechecked only after Zillow sends an availability update.
6. Mark `provider_approved` and `publish_allowed` only after documented provider approval and owner authorization.

No deployment or provider submission was performed as part of this implementation.
