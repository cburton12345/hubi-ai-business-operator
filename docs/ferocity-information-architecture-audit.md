# Ferocity Information Architecture Audit

Date: 2026-07-02

## Purpose

This audit follows the product architecture direction to simplify Ferocity before adding more features.

The goal is not to shrink Ferocity. The goal is to make Ferocity feel like one AI operating system for organizations instead of a large collection of modules.

No UI implementation is included in this document. This is the architecture pass that should be approved before code changes.

## Current State

Ferocity has real depth. It includes auth, workspaces, roles, billing, setup, AI workforce, owner command, leads, jobs, workforce, money, marketing, SEO, reviews, proof, forms, webhooks, integrations, push notifications, inbound email, reminders, access control, and reports.

The problem is not lack of capability. The problem is that too much capability is visible at the same time.

### Current Top Navigation

The current app shell top navigation includes:

- Home
- Autopilot
- Today
- AI Mode
- Business Brain
- Build My System
- Leads
- Jobs
- Crew Day
- Labor
- Jobs & Money
- Money
- Texts
- Growth
- More

The `More` menu then exposes many additional sections:

- Welcome
- Daily Brief
- Notifications
- Work Modes
- Feature Map
- Owner Command
- Personal Ops
- Connected Systems
- AI Workforce
- Automation Timeline
- Automation Command
- Reports
- Onboarding
- Access Requests
- Setup
- Lead Command
- Service Command
- Operations & Workforce
- Action Queue
- Calendar
- Tasks
- Customer Touchpoints
- Publishing Hub
- Marketing OS
- Website Connector
- Customer Proof
- AI Operator
- SEO Autopilot
- Growth Sites
- Reviews
- Automation
- Workflows
- Alerts
- Runbooks
- Operator Depth
- Brands
- Workspaces
- Integrations
- Controls
- Billing
- Access
- Safety & Readiness
- System Health
- Go Live
- Operational QA
- Credentials
- Webhooks
- Exports
- Beta
- Settings

This is too much for a first-time user.

## Main Problems Found

### 1. Too Many Top-Level Choices

The top nav currently tries to expose every important capability. That makes Ferocity look powerful, but also noisy.

Grandpa problem: a normal owner will not know whether to click Today, Autopilot, AI Mode, Build My System, Owner Command, Reports, Actions, or Automation Command.

Walmart problem: a larger operator may appreciate depth, but still needs a clean executive view first.

### 2. Duplicate Attention Concepts

These concepts overlap heavily:

- Today
- Attention Command
- Owner Command Center
- Needs Owner Queue
- Critical Issues Queue
- Do This First
- Owner Checklist
- Action Queue
- AI Task Queue
- Alerts
- Notifications
- Recommendations
- Reports

Recommendation: create one primary home for owner attention.

Primary home: `Today`

Supporting views:

- `Daily Brief` as a scheduled/summary view
- `Action Log` as the trust/history feed
- `Reports` as analysis, not urgent work

Everything else should feed Today, not compete with it.

### 3. Duplicate AI Concepts

These concepts overlap:

- AI Mode
- AI Workforce
- Autopilot
- Build My System
- AI Walkthrough
- AI Monitoring
- Automation Command
- Automation Timeline
- Marketing AI Operator
- SEO Autopilot

Recommendation: split AI into three simple owner questions:

- `Ask AI` - What do you want Ferocity to do?
- `AI Workers` - Which AI roles are available and what are they allowed to do?
- `Action Log` - What did AI prepare, do, block, or need approval for?

`Build My System` should become part of `Ask AI` or onboarding, not a permanent competing top-level destination for every user.

### 4. Duplicate Work / Job Concepts

These concepts overlap:

- Jobs
- Service Command
- Service Ops
- Job Tracker
- Jobs & Money
- Crew Day
- Operations & Workforce
- Calendar
- Tasks
- Routes
- Technician workflow

Recommendation: use neutral language that works beyond contractors.

Primary top-level: `Work`

Subsections:

- Work board
- Projects / jobs / orders
- Schedule
- Team day
- Materials / expenses / proof
- Worker requests

Contractor words like job, crew, route, service area can stay inside industry-specific records, but should not dominate global navigation.

### 5. Duplicate Money Concepts

These concepts overlap:

- Money
- Cash Collection
- Invoices
- Payment links
- Ledger
- Job money board
- Reports
- Billing

Recommendation:

Primary top-level: `Money`

Subsections:

- Open invoices
- Payments received
- Expenses
- Job/project profit
- Reimbursements
- Recurring expenses
- Subscription/billing settings

`Billing` should be a settings/admin subsection unless the user is managing their Ferocity subscription.

### 6. Duplicate Growth / Marketing Concepts

These concepts overlap:

- Growth
- Growth Calendar
- Marketing OS
- Marketing
- SEO
- SEO Autopilot
- Publishing Hub
- Sites
- Website
- Customer Touchpoints
- Proof
- Review
- Website Grader

Recommendation:

Primary top-level: `Growth`

Subsections:

- Website & forms
- SEO / AI search
- Reviews
- Customer proof
- Campaigns
- Publishing
- Lead sources
- Grader reports

The page should answer: "How do we get more demand and prove what works?"

### 7. Contractor Bias

Contractor-specific terms still appear prominently:

- Crew Day
- Service Command
- Field Service Command Center
- Service Ops
- Jobsite
- Technician
- Dispatch
- Route planning
- Service areas

These are valid for contractors, but they should not define Ferocity globally.

Recommendation:

- Use `Work` instead of `Jobs` or `Service` at top level.
- Use `People` instead of `Crew` or `Labor` at top level.
- Use `Projects / jobs / orders` in explanatory copy.
- Allow industry-specific labels later through workspace settings.

### 8. Dashboard Clutter

The current dashboard has too many sections:

- Choose how to use Ferocity
- What Ferocity Runs
- Daily work shortcuts
- Start Here
- What Is Active
- Pick Your Starting Point
- Today Plan
- Owner Snapshot
- People To Plan
- Financial Inputs
- Metrics grid
- Growth To Money
- Controls & Limits
- Needs Follow-Up
- Invoice Follow-Up
- Brands
- Recommendations
- Lead breakdowns
- AI Task Queue

This is too much for the home page.

Recommendation: turn Home into a true morning briefing.

Home should show only:

1. What needs attention
2. What can make money
3. What is blocked
4. What AI did
5. What must be connected next

Everything else moves behind tabs or deeper pages.

### 9. Truth-State Risk

Ferocity is better than it was, but some labels still need discipline:

- `Scheduled` should only mean an actual schedule record exists.
- `Sent` should only mean a provider or manual-send record confirms it.
- `Published` should only mean a page/post is live or exported/published with a record.
- `AI handled` should only mean a recorded action status says AI handled it.
- `Synced` should only mean sync state exists.

Safe labels:

- Draft
- Prepared
- Needs review
- Needs connection
- Needs setup
- Ready to enable
- Manual only
- Sample data
- Provider gated

Known acceptable sample area:

- `/app/sample-tour` clearly says sample data only.

Risk areas to review later:

- Publishing Hub
- Sites
- Calendar
- Notifications metrics
- Automation Timeline
- Any page showing `Sent`, `Published`, `Scheduled`, or `Synced`

## Proposed New Architecture

### Top-Level Navigation

Recommended top-level nav:

1. Home
2. Today
3. Ask AI
4. Customers
5. Work
6. People
7. Money
8. Growth
9. Insights
10. Settings

Advanced tools should move under `More` or a power-user drawer, not primary navigation.

### Navigation Questions

Each item should answer one owner question:

| Nav | Owner Question | Primary Routes To Merge / Point At |
| --- | --- | --- |
| Home | What is happening in my organization? | `/app` |
| Today | What needs me now? | `/app/attention-command`, owner queues, alerts, reminders |
| Ask AI | What can Ferocity help me do? | `/app/ai-workforce`, `/app/build-system`, `/app/autopilot` |
| Customers | Who do we serve and who needs follow-up? | leads, customers, conversations, reviews, proof |
| Work | What are we doing? | jobs, projects, orders, schedule, tasks, service ops |
| People | Who is working or needed? | workforce, labor bench, crew day, assignments |
| Money | What is owed, paid, profitable, or risky? | invoices, payments, expenses, job money, ledger |
| Growth | How do we get more customers? | website, SEO, reviews, proof, campaigns, publishing |
| Insights | What should improve? | reports, grader, ROI, trends, recommendations |
| Settings | How is this configured? | brain, integrations, controls, billing, access, credentials |

### Advanced / Power User Areas

These should remain available, but not top-level:

- Feature Map
- Work Modes
- Automation Timeline
- Automation Command
- Workflows
- Runbooks
- QA
- System Health
- Go Live
- Credentials
- Webhooks
- Exports
- Beta
- Operator Depth
- Connected Systems

These are valuable, but they are not first-click destinations for most users.

## One True Home Decisions

| Concept | Primary Home | Secondary Context Only |
| --- | --- | --- |
| Urgent owner work | Today | Home, Daily Brief |
| AI actions | Ask AI / Action Log | Home, Today |
| Leads | Customers | Growth, Today |
| Follow-up | Customers | Today, Ask AI |
| Jobs/projects/orders | Work | Money, People |
| Crew/workers/labor | People | Work |
| Invoices/payments/expenses | Money | Today, Work |
| SEO/reviews/proof/campaigns | Growth | Insights |
| Reports/ROI/trends | Insights | Home |
| Provider keys/limits/access | Settings | Today if blocking |
| Business memory | Settings / Business Brain | Ask AI |

## Recommended Home Redesign

Home should become the CEO morning briefing.

Recommended layout:

### 1. Top Brief

- Good morning / workspace name
- One sentence summary
- Last updated time
- AI confidence / data readiness indicator

### 2. Three Primary Cards

- Needs Attention
- Money Opportunities
- Blocked / Needs Setup

### 3. AI Activity

Short list only:

- Prepared
- Blocked
- Needs approval
- Handled

Never imply live action unless recorded.

### 4. Business Snapshot

Small, not huge:

- Open leads
- Open work
- Money owed
- Collected this month
- People scheduled

### 5. Next Best Action

One recommendation, not ten cards.

## Recommended Page Philosophy

Every page should start with:

1. What this page is for
2. What needs a decision
3. What Ferocity can do next
4. What is blocked or missing

Then show data.

Then show configuration.

Never lead with configuration.

## Recommended Implementation Sequence

Do not rewrite the backend. Do not delete routes.

### Phase 1: Navigation Simplification

- Reduce top nav to the proposed 10 items.
- Keep advanced routes in a More / Advanced menu.
- Rename labels without changing route paths.
- Add a clear `Advanced tools` panel for power users.

### Phase 2: Home Simplification

- Replace the current dashboard clutter with morning briefing layout.
- Keep existing data queries.
- Move detailed shortcuts to `Advanced tools` or deeper pages.
- Preserve all functionality.

### Phase 3: Duplicate Concept Consolidation

- Today becomes the only urgent work page.
- Ask AI absorbs Build My System / AI Mode / Autopilot entry points.
- Work absorbs Service Command / Job Tracker / Crew Day entry points as subsections.
- Growth absorbs Marketing OS / SEO / Reviews / Proof / Publishing entry points.
- Settings absorbs controls, integrations, credentials, access, billing, business brain.

### Phase 4: Truth-State Pass

- Audit every usage of Scheduled, Sent, Published, Running, Synced, Completed, AI handled.
- Replace unsafe labels with Draft, Prepared, Needs connection, Needs review, Sample data, or Provider gated.
- Add data-state helpers so UI labels map to actual system state.

### Phase 5: Industry-Neutral Language

- Make top-level labels industry neutral.
- Keep contractor/service labels inside work records, examples, and optional templates.
- Add future support for workspace terminology preferences:
  - jobs vs projects vs orders vs cases
  - customers vs clients vs patients vs members
  - workers vs staff vs team

## Proposed Final Navigation Detail

### Home

CEO briefing. Minimal.

### Today

Needs attention. Owner decisions. Urgent money. Blockers. Reminders.

### Ask AI

Plain-English AI command surface. Includes:

- Build my system
- Ask what to do next
- Run a scan
- Prepare follow-up
- Set up growth
- Explain blockers
- Show what AI can do

### Customers

Leads, customers, communication, follow-up, reviews, proof.

### Work

Projects, jobs, orders, tasks, schedule, calendar, materials, inventory, field/work proof.

### People

Team, workers, assignments, time, labor requests, availability, reimbursements, payroll review.

### Money

Invoices, payments, payment links, expenses, reimbursements, ledgers, profit, subscriptions.

### Growth

Website, forms, SEO, AI search, Google profile, campaigns, reviews, proof, publishing, grader.

### Insights

Reports, ROI, trends, recommendations, grader results, operational scorecards.

### Settings

Business Brain, brands, workspaces, integrations, credentials, controls, billing, access, webhooks, exports, safety.

## Features That Should Not Disappear

These should remain fully accessible:

- AI Workforce
- Build My System
- Business Brain
- Owner Command Center
- Daily Brief
- Automation Timeline
- Automation Command
- Leads
- Service Ops
- Job Tracker
- Operations & Workforce
- Labor Bench
- Cash Collection
- Growth Calendar
- Marketing OS
- SEO Autopilot
- Publishing Hub
- Customer Proof
- Reviews
- Website Connector
- Website Grader
- Reports
- Controls
- Integrations
- Credentials
- Billing
- Access
- Webhooks
- System Health

They should be reorganized, not removed.

## Approval Recommendation

I recommend approving Phase 1 and Phase 2 first.

The smallest high-impact implementation is:

1. Simplify AppShell navigation labels and grouping.
2. Redesign `/app` into a calm briefing using existing data.
3. Keep every existing route available through Advanced tools.

This would likely make Ferocity feel 2-3x more polished without touching database architecture or core workflows.
