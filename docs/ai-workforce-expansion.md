# Ferocity AI Workforce Expansion

## Mission

Make Ferocity feel like a business owner is managing AI employees, not configuring scattered software screens.

The AI Workforce is an orchestration layer over existing Ferocity systems. It must not replace or duplicate CRM, leads, reviews, websites, content, automations, billing, messaging, reporting, or settings.

## Guardrails

- Keep existing app routes, auth, RLS, CRM, reviews, lead system, billing, portal, messaging, automations, websites, and content tools intact.
- Keep Traditional Mode available for power users and administrators.
- Make AI Mode the simple default path for normal owners.
- Map AI employee actions to existing Ferocity modules whenever possible.
- Do not create duplicate databases, duplicate workflow engines, duplicate campaign systems, or duplicate CRM records.
- Keep live sends, publishing, ads, sync, and spend behind approval gates.
- The product model is one platform with two interaction modes: 1. AI Mode and 2. Traditional Mode.
- AI Mode is an additional orchestration layer, not a replacement for existing Ferocity functionality.

## First Implementation Order

1. Add a central AI Workforce command center.
2. Show AI employees as roles with plain-English jobs, example commands, and safe next actions.
3. Add quick actions: Get More Leads, Get More Reviews, Create Campaign, Improve Website, Improve SEO, Reactivate Leads, Generate Content, Set Up My Business.
4. Route each quick action into existing Ferocity systems: Build My System, Marketing OS, Website Connector, SEO, Reviews, Operator Console, Automation, Leads, Integrations, Controls.
5. Keep AI Mode and Traditional Mode visible.
6. Add command preview behavior without executing destructive actions.
7. Preserve future TODOs for live AI execution, advanced website crawling, one-click campaign generation, and direct provider publishing.

## AI Employees

- AI Business Setup Manager
- AI Growth Manager
- AI Marketing Manager
- AI Content Manager
- AI Sales Assistant
- AI Receptionist
- AI Review Manager
- AI SEO Manager
- AI Website Manager
- AI Automation Manager
- AI Follow-Up Manager
- AI Ad Manager

## Desired Owner Experience

1. Owner signs up.
2. AI learns the business from simple input, website import, and existing data.
3. AI builds or updates the business profile.
4. AI recommends growth opportunities.
5. AI creates drafts, campaigns, workflows, content, and follow-up plans.
6. Owner previews and approves.
7. Ferocity executes through existing connected systems.
8. Ferocity monitors outcomes and recommends the next action.

## Current Status

- Build My System already creates reviewed setup plans.
- Marketing OS, Website Connector, SEO, Reviews, Automations, Operator Console, and Service Ops already exist as traditional modules.
- AI Mode now routes owner commands into existing setup, marketing, website import, SEO, monitoring, and timeline records.
- Website import safely reads one public HTML page into review-ready Marketing OS facts; advanced crawling and CMS publishing remain provider-gated.
