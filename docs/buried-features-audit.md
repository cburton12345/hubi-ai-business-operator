# Buried Features Audit

Last updated: 2026-06-18

## Summary

Ferocity has more capability than the UI makes obvious. The main problem is not missing features; it is discoverability. Too much work lives behind module names like Operator Depth, Drafts, Exports, Controls, or Service Ops. Normal business owners need job-based entry points.

## Added Now

- Added `/app/feature-map` as a plain-English internal product map.
- Added `/app/role-views` as Work Modes so users enter by job type instead of module name. The product language should not imply a business needs a full staff to use Ferocity.
- Added `Feature Map` to the top app nav and the Start section of the More menu.
- Added `Work Modes` to the top app nav and the Start section of the More menu.
- Added `Find a buried tool` to the home dashboard daily shortcuts.
- Added `/app/cash-collection` for unpaid invoices, overdue follow-up, payment requests, payments received, Stripe readiness, and ledger visibility.
- Added `/app/growth-calendar` for weekly SEO, proof, review, publishing, campaign, website, and ROI work.
- Added `/app/safety-readiness` for provider keys, approvals, live actions, launch blockers, controls, billing, webhooks, and app health.
- Added `/app/service-command` for the plain daily service loop: schedule work, dispatch techs, follow estimates, collect invoices, ask reviews, check inventory, and capture field proof.
- Added `/app/lead-command` for the plain sales loop: new leads, hot leads, conversations, callbacks, queued follow-up, source tracking, and pipeline movement.
- Added `/app/customer-touchpoints` for forms, website snippets, hosted pages, customer portal links, proof links, payment links, public grader, and onboarding paths.
- Added `/app/automation-command` for AI agents, recurring rules, queued actions, consent, live-action policies, provider readiness, and usage limits.
- Added `/app/attention-command` for the shortest owner attention list: decisions, risks, blocked automation, provider gaps, AI actions, and money follow-up.
- Added `/app/notifications` for optional device push setup, VAPID readiness, subscriptions, test sends, and push event history.
- Recently added direct Workforce shortcuts:
  - Punch in / out
  - Schedule work
  - Receipts, mileage, proof
  - Customer updates
  - Payroll review

## Highest-Impact Buried Areas

### Field And Workforce

- Punch in / out
- Clock-out, break minutes, location notes
- Scheduling and dispatch assignments
- Worker/subcontractor records
- Receipt entry and receipt extraction
- Mileage ledger
- Material logs
- Field photos/videos/proof
- Customer update drafts
- Payroll export drafts
- Worker location alerts

Status: mostly surfaced now through `/app/operations-workforce` shortcuts and `/app/feature-map`.

### Service Operations

- Technician workflow
- Route planning
- Inventory and equipment
- Customer portal
- Invoice payment requests
- Payment ledger
- Review request timing after jobs
- Recurring service plans

Status: first combined surface added at `/app/service-command`. Full forms and detailed records remain under `/app/service`.

Cash collection status: first version added at `/app/cash-collection`.

### Leads, Sales, And Follow-Up

- Lead list
- Lead detail
- Conversations
- Draft replies
- Queued follow-up
- Callbacks
- Pipeline stages
- Source tracking
- Action queue
- MarketplacePro lead import

Status: first combined surface added at `/app/lead-command`. Full lead table and Operator Console remain available.

### Automations And AI Actions

- AI agent workflows
- Open AI outputs
- Recurring automation rules
- Action queue review
- Blocked actions
- Missing consent
- Live-action policies
- Provider readiness
- Usage controls and limits

Status: first combined surface added at `/app/automation-command`. Detailed AI Workforce, Action Queue, Automation, Workflows, Controls, Safety, and Integrations pages remain available.

### Marketing And SEO

- Website connector
- Website widget/script path
- Lead source tracking
- SEO Autopilot
- Hosted Growth Sites
- Publishing Hub
- Draft Queue
- Calendar
- Customer proof / UGC
- Review workflows
- Media library
- Graphic jobs
- Video jobs
- Website imports
- Business profile memory

Status: first combined surface added at `/app/growth-calendar`. Marketing OS remains the deeper builder; Growth Calendar is the normal weekly work board.

Customer-facing status: first combined surface added at `/app/customer-touchpoints` so website hookup, forms, portals, proof links, payment links, hosted pages, and public onboarding are not scattered.

### Owner / AI / Reporting

- Owner Command Center
- What Ferocity needs from you
- Critical issues queue
- AI actions feed
- Money radar
- Make Money Next
- Reports
- Business Grader leads
- Business Autopilot Blueprint upgrade requests
- Personal Ops
- Connected systems

Status: Owner Command is now strong. Personal Ops and Business Grader admin need clearer placement.

Attention status: first short owner attention surface added at `/app/attention-command` so reporting, risks, provider gaps, blocked automation, AI actions, and money follow-up do not require hunting.

### Safety, Admin, And Launch

- Action Queue
- Approvals
- Credentials
- Controls and limits
- System Health
- Go Live
- QA
- Safety
- Runbooks
- Webhooks
- Exports
- Access Control
- Billing and cancellation/portal

Status: first combined surface added at `/app/safety-readiness`. Advanced pages remain available behind the summary board.

## Recommended Next UI Work

1. Create work-mode home cards:
   - Owner
   - Office manager
   - Technician/worker
   - Marketing manager
   - Admin

   Status: first version added at `/app/role-views`, then reframed as Work Modes. Ferocity should automate routine work and only ask humans for decisions, approvals, field action, or setup.

2. Create a `Cash Collection` area:
   - invoices
   - payment links
   - Stripe status
   - payment ledger
   - overdue reminders
   - customer portal

   Status: first version added at `/app/cash-collection`.

3. Create a `Growth Calendar` area:
   - SEO pages
   - GBP posts
   - social posts
   - reviews
   - UGC/proof
   - publishing
   - drafts
   - scheduled work

   Status: first version added at `/app/growth-calendar`.

4. Create a `Safety And Readiness` area:
   - action queue
   - approvals
   - credentials
   - controls
   - system health
   - go-live
   - QA
   - runbooks

   Status: first version added at `/app/safety-readiness`.

5. Keep traditional pages available:
   - Do not remove advanced pages.
   - Do not duplicate systems.
   - Use the new surfaces as navigation and orchestration layers.

## Product Rule

If a feature has a working page, it must also have at least one plain-English route from:

- Home
- Owner Command
- Feature Map
- Setup / Build My System
- The relevant role view

No important workflow should require guessing the internal module name.
