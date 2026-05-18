# Phase 1 Architecture

This platform is a multi-tenant SaaS AI Business Operator. It must support internal portfolio brands first, then external customer workspaces without a rewrite.

## Core Hierarchy

```text
Platform
  -> Tenant / Account / Workspace
    -> Brand
      -> Leads
      -> AI tasks
      -> AI drafts
      -> Recommendations
      -> Approvals
      -> Activity logs
```

`tenant_id` is the security boundary. `brand_id` is the operating context.

## Phase 1 Scope

- Multi-tenant database structure
- Separate business accounts/workspaces
- Multi-brand support inside each tenant
- Lead capture and CRM-lite lead management
- AI-generated draft queue
- Content and campaign recommendations
- Admin approval workflow
- Audit logging
- SaaS-ready billing placeholders

## Business Models

Brands must support multiple business models:

- `local_service`: roofing contractor, restoration, home services
- `rental`: trailer rental and similar request-driven businesses
- `software`: property management software, SaaS demos
- `marketplace`: auction marketplace, buyer/seller activity
- `lead_generation`: Ferocity / personal injury lead generation

AI workflows should branch by `business_model` and `risk_profile`, not by hardcoded brand names.

## Access Model

- Platform users can support or administer all tenants only if they have a platform role.
- Tenant users can only access their tenant.
- Brand-level access can be added when a tenant needs different users assigned to different brands.
- All operational tables include `tenant_id`.

## Approval Rules

Low-risk AI outputs can be drafted freely. High-risk actions require approval.

High-risk examples:

- Ad budget increases
- Major homepage edits
- Legal-sensitive wording
- Pricing changes
- Deleting important pages
- Major campaign launches
- Reputation-sensitive public responses

For Ferocity and other legal-sensitive lead-generation brands, public-facing legal copy should default to `needs_review`.
