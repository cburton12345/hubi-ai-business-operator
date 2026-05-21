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

- [x] Define prompt context builder from tenant, brand, services, locations, offers, and marketing settings
- [x] Generate weekly draft tasks per active brand
- [x] Generate draft content only, not auto-publish
- [x] Generate SEO recommendations
- [x] Generate campaign recommendations
- [x] Classify risk level for drafts and recommendations
- [x] Default legal-sensitive brands to review-required
- [x] Store AI input context and output metadata for auditability

## Tenant And SaaS Platform

- [x] Platform admin role
- [x] Tenant owner role
- [x] Tenant admin role
- [x] Tenant operator role
- [x] Tenant viewer role
- [ ] Tenant workspace settings
- [ ] Brand-level access rules
- [x] User invites
- [ ] Client onboarding flow
- [ ] Plan/billing placeholders
- [ ] Usage tracking placeholders
- [ ] External customer onboarding checklist
- [ ] Tenant data export path

## Brand Data Model

- [x] Brand profile editor
- [x] Domain settings
- [x] Phone/email settings
- [x] Logo URL strategy
- [ ] Services editor
- [ ] Locations editor
- [ ] Offers editor
- [x] Target customer settings
- [x] CTA goal settings
- [x] Ad goal settings
- [x] SEO target settings
- [x] Review strategy settings
- [x] Follow-up strategy settings
- [x] Tone-of-voice settings
- [x] Risk profile settings

## Lead Management

- [x] Public lead capture endpoint hardening
- [x] Spam prevention
- [x] Rate limiting
- [ ] Form public key rotation
- [x] Source tracking
- [x] UTM tracking
- [ ] Lead scoring foundation
- [ ] Lead assignment
- [ ] Lead event timeline
- [ ] Lead filters
- [ ] Lead search
- [ ] CSV export
- [ ] Duplicate lead detection
- [ ] New lead notifications

## Field Service Operating Core

- [x] Customer records
- [x] Lead/customer service operations foundation
- [x] Lead-to-customer conversion flow
- [x] Estimate builder foundation
- [x] Invoice/payment placeholders
- [x] Appointment/job scheduling foundation
- [x] Estimate workflow detail pages
- [x] Job workflow detail pages
- [x] Invoice workflow detail pages
- [x] Estimate line item editing
- [x] Invoice line item editing
- [x] Team/technician assignment placeholder
- [x] Service business dashboard
- [x] Manual estimate follow-up drafts
- [x] Manual payment notes
- [x] Customer timeline across leads, estimates, jobs, and invoices
- [x] Customer portal
- [x] Route planning
- [ ] Recurring service plans
- [ ] Technician mobile workflow
- [ ] Inventory/equipment tracking

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

- [x] Rental date fields
- [x] Delivery-needed fields
- [x] Rental item type fields
- [ ] Quote request status workflow
- [ ] Local rental SEO draft recommendations

## Software Businesses

- [x] Demo request lead type
- [x] Company and role fields
- [x] Current system field
- [x] Units/accounts managed field
- [ ] Demo nurture content drafts
- [ ] Comparison page recommendations

## Marketplace Businesses

- [x] Buyer lead type
- [x] Seller lead type
- [x] Bidder lead type
- [x] Consignor lead type
- [x] Asset category fields
- [x] Estimated value fields
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

- [x] Lead volume drop alerts
- [ ] Conversion problem alerts
- [ ] Bad review alerts
- [ ] Ad performance drop alerts
- [x] Failed form alerts
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
