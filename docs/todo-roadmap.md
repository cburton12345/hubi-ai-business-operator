# Hubi AI Business Operator Todo Roadmap

This project is a multi-tenant SaaS AI Business Operator. It must support internal portfolio brands first, then external paying businesses without a rewrite.

The product should eventually act like an AI COO for local service, rental, software, marketplace, and lead-generation businesses. Phase 1 must stay focused on the foundation.

## Current Foundation

- [x] Multi-tenant architecture documented
- [x] Supabase migration for tenants, brands, leads, AI tasks, drafts, recommendations, approvals, and audit logs
- [x] Tenant isolation RLS policy migration
- [x] Next.js app shell
- [x] Admin dashboard placeholder
- [x] Internal portfolio demo brands
- [x] Ferocity / personal injury lead-generation support in the model
- [x] Public lead capture API foundation
- [x] Render deployment config
- [x] GitHub repo and push workflow
- [x] Internal portfolio seed migration
- [x] Ferocity rename completed
- [x] Dashboard can read tenant-scoped Supabase data when env vars are configured

## Phase 1: Foundation

- [x] Apply Supabase migrations to a clean project
- [x] Verify RLS policies against Supabase Auth-compatible user context
- [x] Create seed migration for internal tenant
- [x] Apply seed migration for internal tenant
- [x] Seed internal brands:
  - [x] Create seed for 4bid
  - [x] Create seed for MarketplacePro
  - [x] Create seed for Preferred Trailer Rental
  - [x] Create seed for Homes4Rent
  - [x] Create seed for Roofing / storm restoration
  - [x] Create seed for Ferocity
  - [x] Apply internal brand seeds to Supabase
- [x] Create real tenant membership flow for first admin user
- [x] Add protected admin routes
- [x] Add tenant selector
- [x] Add brand selector
- [x] Add tenant-scoped Supabase dashboard query fallback
- [x] Replace remaining demo queues with real Supabase query tables
- [x] Build CRM-lite lead dashboard
- [x] Add lead detail view
- [x] Add lead status updates
- [x] Add lead notes and event history
- [x] Create reusable public lead forms by brand
- [x] Add business-model-specific lead detail handling:
  - [x] Local service
  - [x] Rental
  - [x] Software/demo
  - [x] Marketplace buyer/seller
  - [x] Legal/personal injury intake
- [x] Add AI task queue table views
- [x] Add AI draft queue table views
- [x] Add recommendation queue views
- [x] Add approval queue views
- [x] Add approve/reject/change-request actions
- [x] Log important admin actions to `activity_logs`
- [x] Add basic tests for lead capture and approval workflow
- [ ] Deploy first Render preview
  - [x] Validate `render.yaml` against Render workspace
  - [ ] Connect GitHub repo access in Render or make the repo fetchable by Render
  - [ ] Add missing Supabase runtime secrets in Render
  - [ ] Trigger and verify first live deploy

## Phase 1 AI Scope

- [ ] Define prompt context builder from tenant, brand, services, locations, offers, and marketing settings
- [ ] Generate weekly draft tasks per active brand
- [ ] Generate draft content only, not auto-publish
- [ ] Generate SEO recommendations
- [ ] Generate campaign recommendations
- [ ] Classify risk level for drafts and recommendations
- [ ] Default legal-sensitive brands to review-required
- [ ] Store AI input context and output metadata for auditability

## Tenant And SaaS Platform

- [ ] Platform admin role
- [ ] Tenant owner role
- [ ] Tenant admin role
- [ ] Tenant operator role
- [ ] Tenant viewer role
- [ ] Tenant workspace settings
- [ ] Brand-level access rules
- [ ] User invites
- [ ] Client onboarding flow
- [ ] Plan/billing placeholders
- [ ] Usage tracking placeholders
- [ ] External customer onboarding checklist
- [ ] Tenant data export path

## Brand Data Model

- [ ] Brand profile editor
- [ ] Domain settings
- [ ] Phone/email settings
- [ ] Logo upload strategy
- [ ] Services editor
- [ ] Locations editor
- [ ] Offers editor
- [ ] Target customer settings
- [ ] CTA goal settings
- [ ] Ad goal settings
- [ ] SEO target settings
- [ ] Review strategy settings
- [ ] Follow-up strategy settings
- [ ] Tone-of-voice settings
- [ ] Risk profile settings

## Lead Management

- [ ] Public lead capture endpoint hardening
- [ ] Spam prevention
- [ ] Rate limiting
- [ ] Form public key rotation
- [ ] Source tracking
- [ ] UTM tracking
- [ ] Lead scoring foundation
- [ ] Lead assignment
- [ ] Lead event timeline
- [ ] Lead filters
- [ ] Lead search
- [ ] CSV export
- [ ] Duplicate lead detection
- [ ] New lead notifications

## Ferocity / Personal Injury Lead Generation

- [x] Ferocity brand seed
- [x] Legal-sensitive risk profile
- [x] Case intake fields
- [x] Consent capture
- [x] Disclaimer acknowledgement
- [ ] No-legal-advice content guardrails
- [ ] No compensation guarantee guardrails
- [ ] Attorney relationship disclaimer handling
- [ ] Qualification status workflow
- [ ] Lead scoring rules
- [ ] Buyer/routing model foundation
- [ ] Manual approval before external routing

## Local Service Businesses

- [ ] Service-area lead forms
- [ ] Quote request flow
- [ ] Appointment request flow
- [ ] City/service page recommendation model
- [ ] Google Business Profile post drafts
- [ ] Review request draft campaigns
- [ ] Follow-up text/email drafts

## Rental Businesses

- [ ] Rental date fields
- [ ] Delivery-needed fields
- [ ] Rental item type fields
- [ ] Quote request status workflow
- [ ] Local rental SEO draft recommendations

## Software Businesses

- [ ] Demo request lead type
- [ ] Company and role fields
- [ ] Current system field
- [ ] Units/accounts managed field
- [ ] Demo nurture content drafts
- [ ] Comparison page recommendations

## Marketplace Businesses

- [ ] Buyer lead type
- [ ] Seller lead type
- [ ] Bidder lead type
- [ ] Consignor lead type
- [ ] Asset category fields
- [ ] Estimated value fields
- [ ] Buyer/seller campaign recommendations
- [ ] Auction content draft workflow

## Approval Workflow

- [ ] Low-risk draft review
- [ ] Medium-risk approval
- [ ] High-risk approval
- [ ] Changes-requested workflow
- [ ] Rejection notes
- [ ] Approval audit log
- [ ] Published/ready status distinction
- [ ] Admin-only public action controls

## Future Automation

- [ ] Recurring SEO posts
- [ ] Google Business Profile posts
- [ ] Facebook posts
- [ ] Review request campaigns
- [ ] Follow-up sequences
- [ ] Nurture messaging
- [ ] Reporting summaries
- [ ] Low-risk content publishing
- [ ] Human approval for high-risk actions

## Alerts And Monitoring

- [ ] Lead volume drop alerts
- [ ] Conversion problem alerts
- [ ] Bad review alerts
- [ ] Ad performance drop alerts
- [ ] Failed form alerts
- [ ] Payment failure alerts
- [ ] SEO ranking drop alerts
- [ ] Listing problem alerts
- [ ] Customer communication failure alerts

## Integrations Later

- [ ] Supabase Auth
- [ ] Stripe billing
- [ ] Google Business Profile
- [ ] Facebook / Meta
- [ ] Google Ads
- [ ] Search Console
- [ ] Analytics
- [ ] Email provider
- [ ] SMS provider
- [ ] Review platform integrations
- [ ] Calendar/appointment integrations
- [ ] Webhook framework

## Production Readiness

- [ ] Environment variable policy
- [ ] Secret rotation plan
- [ ] Database backup plan
- [ ] Migration review process
- [ ] RLS test coverage
- [ ] API validation coverage
- [ ] Error logging
- [ ] Rate limiting
- [ ] Audit logs
- [ ] Tenant isolation tests
- [x] Render Blueprint validation
- [ ] Render deploy verification
- [ ] Supabase usage monitoring
- [ ] Security review before external customers

## Do Not Do Yet

- [ ] Do not auto-publish public content
- [ ] Do not auto-change ad budgets
- [ ] Do not delete pages automatically
- [ ] Do not launch major campaigns automatically
- [ ] Do not respond publicly to sensitive reviews automatically
- [ ] Do not build a giant website builder before the operating core works
- [ ] Do not hardcode the system around one business
