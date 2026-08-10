# Ferocity founder-level final pre-deploy audit

**Date:** July 31, 2026
**Decision:** Engineering release candidate passes. Production deployment remains intentionally paused for owner approval.

## Executive verdict

Ferocity is ready for an owner-authorized production deployment as a credible AI operating system for service businesses. The current release is not merely a collection of disconnected feature screens: 39 important workflows have explicit integration guards connecting acquisition, qualification, follow-up, scheduling, field work, estimates, payments, reviews, marketing, provider costs, incumbent service-platform coexistence, authority, and owner escalation.

The audit did not justify a broad redesign. Four surgical improvements were justified and completed:

1. The featured public demo can now be changed without redeploying the application.
2. The homepage hero, homepage final invitation, demo hero, and pricing hero can now be edited without redeploying the application.
3. Production database connections now have a staged Supabase CA certificate so the application can verify the database host instead of only encrypting traffic.
4. Advertising credits and promotional offers can now be evaluated against already-planned spend, deadlines, eligibility, and explicit budget caps without creating a campaign or enabling live spend.
5. Jobber, HighLevel, and Housecall Pro can coexist through signed, tenant-scoped inbound bridges for contacts, leads, and jobs. Jobber also has a native read-only OAuth and provider-owned analysis path; outbound writes remain off.

## Customer and business audit

### Strong

- The homepage leads with three owner outcomes: win more work, lose less money, and get time back.
- The primary buying path offers both `Start Ferocity` and the lower-commitment `View plans` choice.
- The free offer is the business grader, not an open-ended free software tier.
- Pricing and feature-readiness language distinguishes working features, connected-provider features, and provider-gated features.
- The core differentiation is coherent: Ferocity prepares or performs authorized work instead of only organizing tasks.
- The customer lifecycle is connected from lead capture through job completion, payment, review, referral, retention, and reactivation.
- Simple role views and owner-command surfaces protect ordinary customers from the full product's depth.

### Watch after launch

- `All Tools` contains 60 unique destinations. This is intentionally secondary navigation and currently passes the duplication guard, but real usage telemetry should determine which tools can be grouped or retired. Do not reorganize it immediately without customer evidence.
- The product's breadth creates an ongoing truthfulness obligation. Keep the existing feature-readiness and provider-lane labels; never convert `planned` into `live` because credentials merely exist.
- The current public walkthrough remains the fallback until a polished product video is supplied. This is not a functional blocker, but a strong video should improve comprehension and conversion.

## Technical architecture audit

### Strong

- Telephony, voice intelligence, messaging, email, video, AI models, advertising, and customer-owned credentials are separated through provider interfaces and guarded adapters.
- Core business behavior is owned by Ferocity rather than embedded inside Retell, Twilio, Vapi, Google, or another provider.
- Tenant isolation is enforced by RLS verification, scoped credentials, workspace resolution, and protected global administration.
- Canonical service records connect CRM, estimates, work orders, visits, field evidence, inventory, invoices, payments, and reporting.
- Managed provider costs have workspace limits, global limits, reservations, metering, rebilling records, and emergency controls.
- Low-risk autonomy is separated from protected customer communication, public publishing, voice calls, premium rendering, and spending authority.
- Public forms and APIs have rate-limit and abuse-control foundations.
- Production dependencies currently report zero known vulnerabilities.

### Surgical hardening completed

- Migrations 156 and 157 add a small typed `featured_demo` slot, four high-impact public-copy slots, and version history. This is not a general-purpose HTML CMS.
- Only a Ferocity platform administrator can edit the featured demo.
- Supported media are restricted to HTTPS direct video files, privacy-enhanced YouTube embeds, or Vimeo embeds. Unsupported media falls back to the built-in walkthrough.
- Homepage, demo, and pricing content revalidate within approximately 60 seconds, so changing the featured video or key public messaging does not require a deployment.
- A Supabase CA certificate is staged in Netlify production. The existing pooler was tested successfully with certificate verification enabled. Supabase recommends `verify-full` with its project CA for the strongest Postgres TLS validation: https://supabase.com/docs/guides/platform/ssl-enforcement
- Migration 158 adds tenant-isolated advertising-promotion records and audit events. Offers recommended as `skip` cannot be approved, existing provider caps are never silently loosened, and promotion approval remains separate from campaign authorization and live spend.

## Security and reliability evidence

- 162 migrations recognized; migrations 156 through 162 applied successfully, including deployless public content, provider promotions, native calendar sync, the Google Business Profile read model, service-platform coexistence bridges, and native Jobber read analysis.
- RLS and sensitive-table grant verification passed.
- 62 test files / 220 tests passed.
- TypeScript, ESLint, production build, public-data guard, UI guard, and diff validation passed.
- Production dependency audit: 0 critical, 0 high, 0 moderate, 0 low known vulnerabilities.
- 224 routes and 201 component files passed the UI link/duplication guard.
- 39 connected workflows passed the feature-integration guard.
- Provider-promotion rollback smoke passed for capture, guarded approval, the live-spend lock, progress, and qualification; no smoke data was retained.
- Customer-selected advertising limits are optional. When omitted or cleared, Ferocity applies conservative internal campaign boundaries; campaign authorization and live spend remain separately protected.
- The TZS-only, portfolio-owner, and existing-administrator credentials were intentionally regenerated and verified against Supabase. Their passwords exist only in a Windows-user-encrypted handoff outside the repository.
- Local customer acquisition, workspace provisioning, grader, Stripe checkout creation/expiration, owner, estimate, review, receptionist, autonomy, office-manager, and render smoke paths pass.

## What can change without another deployment

- Featured homepage/demo video, poster, label, headline, description, and CTA through the platform-admin section of Workspace Settings.
- Homepage hero, homepage final invitation, demo hero, and pricing hero labels, headlines, descriptions, and both CTA buttons.
- Brands, offers, services, workflows, authority settings, review destinations, provider credentials, customer/job data, generated content, and other existing database-driven configuration.
- Provider-side billing, account approval, and OAuth authorization where the deployed callback already supports the provider.

## What still requires a deployment

- New React layouts or components.
- Structural navigation changes.
- New API routes, provider adapters, database migrations, or security behavior.
- Public copy outside the deliberately configurable marketing slots.

This boundary is intentional. A broad live page builder would increase attack surface, introduce inconsistent branding, and make the buying experience easier to break.

## Post-deploy certification

These checks require the new production runtime and are not reasons to weaken the pre-deploy gate:

1. Complete one low-cost Veo render and verify retrieval, metering, and limits.
2. Complete one real Retell handset call and verify greeting, routing, transcript, summary, costs, and escalation.
3. Complete reporting-only OAuth authorization for each approved launch advertising provider without creating spend.
4. Verify Stripe subscription, webhook, Stripe Connect, and tenant invoice-payment behavior on the deployed release.
5. Run the production route, mobile, authentication, tenant-isolation, and security smoke suite.
6. Add exact public review destinations when Ferocity or a customer creates the relevant business profile; private feedback remains available without one.

## Deliberately deferred

- A generic CMS/page builder.
- Automatic production deployment of AI-created provider adapters.
- Unapproved advertising spend or campaign changes.
- Unsupported Yahoo or Snapchat claims.
- A Snowie-style voice benchmark until the current release is deployed and the owner separately authorizes that work.
- Replacing the MarketplacePro shared-secret contract until both systems can adopt a versioned HMAC contract without breaking existing events.

## Recommendation

After the owner reviews this audit and explicitly authorizes deployment, deploy this release once. Then run the post-deploy certification in order and disable any provider lane that fails rather than misrepresenting it as live.
