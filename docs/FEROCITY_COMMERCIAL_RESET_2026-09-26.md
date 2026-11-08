# Ferocity commercial reset — implementation record

## Controlling position

Ferocity is the AI business operating system: shared business context, cross-functional coordination, controlled execution, and owner-level attention. It is not positioned as an AI agency, a generic wrapper, or a disconnected feature collection.

## Preserved

- All existing application capabilities, provider adapters, authenticated workspaces, and historical billing records.
- Ferocity Earn: 0.9% on customer-originated collected revenue managed by Ferocity; 6% on Ferocity-originated collected revenue; never stacked.
- Managed usage allowances: voice 25/100/300 minutes and hosted SMS 100/300/1,000 segments; overages $0.25/minute and $0.04/segment.
- Focused entry products: Calls, Connect, and Job Tracker, now visually secondary to the full operating system.

## New-sale commercial model

- Starter: $149/month or $1,490/year.
- Growth: $349/month or $3,490/year. Label: Recommended.
- Operator: $699/month or $6,990/year.
- Existing subscriptions are not repriced by this change.

## Implemented in this pass

- Central public plan configuration and annual price support.
- Annual Stripe price environment boundaries and checkout interval metadata.
- Shorter, decision-oriented pricing experience with an Earn calculator and explicit cost buckets.
- Guided homepage business/bottleneck diagnostic that carries context into the real Ferocity sales chat.
- Navigation aligned to Product, Solutions, Integrations, Pricing, Earn, and Sign In.
- Expanded first-party funnel event vocabulary using the existing `public_site_events` system.
- Mobile plan comparison treatment and the identified product-preview contrast correction.

## Production release completed

- New Stripe monthly and annual prices were created and placed in the Netlify environment.
- Migrations 230 and 231 were validated and applied successfully.
- Typecheck, targeted lint/tests, UI guard, public-claims guard, and production builds passed.
- Annual checkout was verified to create a Stripe Checkout redirect; the temporary access-request records were removed afterward.
- The homepage diagnostic was verified to carry business type and bottleneck into Ask Ferocity.
- Mobile Lighthouse on the final preview scored 99 performance, 100 accessibility, 100 best practices, and 0 CLS. The preview-only SEO score is not representative because deploy previews are intentionally not indexable.
- Production deploy `6ab77294c7e6dc75eae6a26f` went live at `https://ferocity.live` and post-deploy route/content smoke checks passed.

## Route policy

No route was deleted or broadly redirected during this reset. Consolidation is progressive-disclosure work, not destructive removal. Existing deep links remain valid until analytics and support history establish that a redirect is safe.

## November 7, 2026 public entry-model update

- Free is a real $0-forever plan with no card: one owner workspace, one active form, up to 25 new leads per month, bounded guidance and drafts, and no managed voice, hosted SMS, provider writes, external messaging, publishing, or advertising spend.
- Starter remains $149/month or $1,490/year. Growth remains $349/month or $3,490/year.
- Operator is sales-assisted custom pricing, typically starting at $699/month. Existing Operator Stripe prices remain configured for grandfathered subscriptions and authenticated account changes; new public Operator requests receive implementation review instead of direct checkout.
- Ferocity Earn remains available under its existing collected-revenue rules. Provider usage, payment processing, advertising, and other third-party costs remain separate.
- Existing subscriptions are not repriced. Free and Earn create safe-mode workspaces through the secure invitation flow; paid self-serve plans retain the short-lived checkout handoff.
