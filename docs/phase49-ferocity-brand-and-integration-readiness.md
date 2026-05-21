# Phase 49 Ferocity Brand And Integration Readiness

Phase 49 corrects the product-facing brand name and expands integration readiness visibility.

## What Changed

- Renamed product-facing labels from Hubi to Ferocity.
- Updated app metadata, landing page copy, login copy, app shell branding, roadmap title, package name, and Render blueprint service name.
- Added `x-ferocity-webhook-token` as the preferred inbound webhook token header while keeping the previous header as a compatibility fallback.
- Expanded planned integration rows to include Supabase Auth, Search Console, Analytics, email provider, review platform, calendar provider, and webhook framework in addition to Stripe, Google Business Profile, Meta, Google Ads, SMS, and external publishing.

## Compatibility Left In Place

- Existing cookie names remain unchanged to avoid forcing active users out.
- Existing GitHub and Render URLs remain unchanged until those remote resources are renamed.
- The old webhook token header remains accepted so existing test clients do not break.

## Still Requires Credentials

- Stripe
- Google Business Profile
- Facebook / Meta
- Google Ads
- Search Console
- Analytics
- Email provider
- SMS provider
- Review platform
- Calendar provider
