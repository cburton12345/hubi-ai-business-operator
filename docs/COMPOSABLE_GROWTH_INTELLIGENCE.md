# Composable Growth Intelligence

## Outcome

Ferocity's existing Growth Department, Marketing OS, SEO/GEO, Local Presence,
Distribution, CRM, jobs, money, reviews and attribution systems remain the
systems of record. This upgrade connects them with reusable playbooks, a shared
Marketing Brain, durable SEO and AI-answer observations, business-value scoring
and owner-goal composition. It does not add a standalone marketing product.

## Reused systems

- AI Growth Department and closed-loop Growth Controller
- Marketing Memory, voice-of-customer signals, ICPs, ideal jobs and offers
- SEO Autopilot, content strategy, page opportunities and authority tasks
- provider-neutral Distribution/Publishing Engine
- provider-neutral Local Presence system
- CRM, messaging, Connect, calls, forms, estimates, jobs, invoices and payments
- proof/UGC, reviews and source/revenue attribution
- Ferocity owner chat and existing permission/approval controls

## Added connective capabilities

### Versioned marketing playbooks

`marketing_playbooks`, `marketing_playbook_versions` and
`marketing_playbook_runs` store reusable contracts and their executions. Every
version declares required context, workflow, decisions, outputs, quality checks,
success metrics and permissions. Core playbooks cover closed-loop growth,
continuous SEO, AI-answer visibility, Local Presence and evidence-to-distribution.

Owner outcomes create a measurable `growth_objective` and compose the relevant
playbook versions into idempotent planned runs. A playbook plan does not itself
authorize external work. Existing action-level approvals remain authoritative.

### Shared Marketing Brain

`marketing_brain_snapshots` compiles durable shared truth from existing records:
business identity, services, geography, audience/ICPs, positioning, offers,
objections, voice-of-customer, learned messaging, approved proof and actual
revenue/profit outcomes. Missing context and confidence are explicit. Agents use
the latest snapshot instead of inventing disconnected context.

### Continuous SEO loop

`seo_growth_cycles` records AUDIT -> PRIORITIZE -> FIX/PREPARE -> MEASURE -> LEARN
cycles across page and technical opportunities, AI-search visibility, Local
Presence, content quality and distribution failures. It invokes the existing SEO
engine and prepares only policy-safe work; it does not fabricate rankings or
silently publish.

### AI-search visibility history

Representative customer questions are maintained for supported answer engines.
Real observations preserve provider, citations, competitor mentions, description,
factual inaccuracies, content gaps and a hash of the raw response. Ferocity does
not claim visibility without an observation. Findings create reviewable Marketing
OS recommendations and SEO strategy items so source/fact gaps become work.

`llms.txt` can be one legitimate technical artifact where useful, but it is not
treated as a ranking mechanism.

### Opportunity and business-value learning

Growth opportunities now retain separate impact, relevance, effort, confidence
and urgency scores plus a combined business-value score. Attribution touches now
close the loop through qualification, booking, completed work, collected revenue,
gross profit, reviews, repeat customers and referrals.

The optimization target is qualified demand and profitable collected work—not
impressions, clicks or content volume.

### Owner-level goals

Ferocity can translate plain outcomes such as “Fill next week,” “Get more roof
replacements,” “Improve our Google visibility,” or “Get more profitable jobs
without increasing ad spend” into a durable objective, constraints and composed
playbooks. Ferocity chat routes explicit growth outcomes into this layer while
keeping publishing, paid spend and reputation-impacting actions gated.

## Automation and safety

- Internal analysis and safe preparation may run automatically.
- External actions follow workspace autonomy and provider capability truth.
- Paid spend, destructive work and uncertain or reputation-impacting actions
  require explicit authority unless a narrow, tested owner policy allows them.
- No fake reviews, fabricated engagement, spam, keyword stuffing, invented
  competitor facts or unsupported visibility claims.
- Provider errors and missing connections remain visible; they are not reported
  as completed work.

## Daily composition

The existing daily AI Growth Department sweep now:

1. ensures the current playbook contracts;
2. refreshes the shared Marketing Brain;
3. refreshes the existing SEO foundation and records an SEO cycle;
4. maintains representative AI-search questions;
5. rescales open opportunities by business value;
6. refreshes source-to-profit attribution;
7. runs the existing closed-loop controller;
8. asks the Growth Department to compose the supplied playbooks and produce at
   most five high-value owner actions;
9. learns from real content and business outcomes.

## Database migration

Migration: `supabase/migrations/227_composable_growth_intelligence.sql`

This migration must be applied before the new orchestration code runs in a live
environment. No frontend deployment or production migration was performed as
part of this implementation.
