# Business Autopilot

Business Autopilot is the simple owner-facing layer over Ferocity's existing systems.

It does not replace:

- CRM
- Leads
- Jobs
- Invoices
- Reviews
- Website tools
- SEO tools
- Marketing tools
- Workforce tools
- Labor Bench
- Owner Command Center
- Controls and settings

It points owners to what matters now:

1. What Ferocity is watching.
2. What AI can prepare or handle.
3. What needs owner approval.
4. What is blocked by setup, keys, tier limits, or safety controls.
5. What to connect next.

## Control Model

Autopilot does not mean the owner loses control.

Default behavior:

- AI can monitor.
- AI can draft.
- AI can summarize.
- AI can recommend.
- AI can queue safe internal work.
- Live customer sends, public publishing, provider sync, worker contact, billing, and payment actions stay behind approval, connected credentials, and plan limits.

## Main Route

`/app/autopilot`

Related routes:

- `/app/build-system`
- `/app/ai-workforce`
- `/app/business-brain`
- `/app/automation-timeline`
- `/app/attention-command`
- `/app/safety-readiness`
- `/app/customer-touchpoints`

## QA

`scripts/qa-route-crawl.mjs` includes `/app/autopilot` as a protected route. `scripts/production-readiness-check.mjs` requires the page and checks that the protected route crawl covers it.
