# Ferocity Managed Operator Launch Plan

Ferocity should be tested as its own first managed customer before promising hands-free operations to customers.

The goal is not to pretend the AI can magically run a company without context. The goal is to give the AI enough business facts, connected signals, rules, approvals, and provider access that it can handle routine work and only interrupt the owner for money, risk, failures, customer issues, or decisions.

## 1. Set Ferocity Up As Its Own Managed Customer

Status: in progress

- Use Ferocity's own workspace as the first dogfood workspace.
- Treat Ferocity leads, access requests, support messages, billing events, marketing tasks, provider failures, and launch tasks as real owner-operation events.
- Route those events into the Owner Command Center and AI Workforce instead of tracking them across chats.
- Use the Managed Operator page as the control room for "what Ferocity is handling" and "what Chris still needs to decide."

## 2. Complete Business Info

Status: ready for local use

Ferocity needs these facts before AI can make confident decisions:

- What Ferocity sells.
- Who Ferocity is for.
- Pricing and managed-service rules.
- Target customer types.
- What AI is allowed to do automatically.
- What must require approval.
- Brand voice and words to avoid.
- Escalation rules for refunds, billing, customer disputes, legal/safety, and ad spend.

Implementation path:

- Use `/app/business-brain` as the source of truth.
- Use `/app/build-system` to create an initial setup plan.
- Use `/app/ai-workforce` for plain-English commands.
- Use `/app/managed-operator` to see what is ready, blocked, or waiting.

## 3. Connect And Verify Live Providers

Status: mostly configured for live testing; several marketing providers remain account-gated

These can be wired without another frontend deploy if the code already knows the env var names:

- Stripe subscriptions and webhook secret.
- Stripe Connect / managed payments when account review and Connect setup are complete.
- Resend outbound email.
- Resend inbound email webhook if receiving/replying in Ferocity is enabled.
- Web push VAPID keys.
- OpenAI key.
- Owner Command Center token.
- AI Workforce monitor token.
- Google, Meta, Reddit, TikTok, Microsoft, Yahoo ads/search/social provider keys as they become available.
- Google Business Profile and analytics provider credentials when ready.

Latest local readiness check:

- Core app: configured.
- Credential vault: configured.
- Owner Command Center intake: configured.
- AI monitor jobs: configured.
- Workforce intake: configured.
- MarketplacePro bridge: configured.
- Push notifications: configured.
- Google/GBP connection: configured.
- Reddit connection: configured.
- Microsoft connection: configured.
- Resend email: verified for `ferocity.live`.
- Stripe subscriptions: live key can read all configured prices.
- OpenAI: reachable with the configured model.
- Provider lane smoke test: passed for 11 capability groups.

Current outside-account blockers:

- Meta app credentials are still missing.
- TikTok app credentials are still missing.
- Yahoo app credentials are still missing.
- Twilio SMS is intentionally optional. Ferocity currently relies on app alerts, email, dashboard queues, and manual text drafts.
- Managed Stripe payouts require full Stripe Connect readiness, fee disclosure, payout handling, refunds, disputes, and webhook verification before claiming live managed payments.

Rule:

- Missing credentials must never crash the app.
- Ferocity should show "needs connection" or "managed option available" instead of claiming live sync.

## 4. Run The Real Dogfood Loop

Status: local smoke passed; live dogfood still needs real Ferocity traffic

Minimum loop:

1. A visitor requests access or fills a lead form.
2. Ferocity records source, plan interest, business type, and message.
3. Owner Command Center flags the opportunity if money or urgency is high.
4. AI Workforce prepares reply, next steps, and onboarding plan.
5. Human approves any outbound message or payment action.
6. Stripe subscription or manual billing path is recorded.
7. New workspace is created.
8. Customer setup runs through Business Info, website connection, controls, and first automation.
9. Daily Brief summarizes what happened and what matters next.

Latest local smoke:

- Access request route created a workspace/invite path.
- Business Grader created a completed report.
- Workspace seed created source tracking and a public form.
- Sales and owner records were created.
- Free checkout routed correctly.
- Starter checkout created a Stripe Checkout session.
- Owner Command Center intake accepted and stored a 4Bid-style event, then cleanup succeeded.
- AI command smoke passed.

What this proves:

- The basic lead-generation, assessment, workspace creation, checkout, AI command, and owner-event backbone is working locally.

What it does not prove yet:

- Real paid customer conversion.
- Real email deliverability to every recipient type.
- Real push notification delivery on each device.
- Real managed payouts.
- Real ad account publishing.
- Real Google Business Profile posting or review sync.
- Long-running daily monitoring reliability.

## 5. Owner Interrupt Rules

Status: implemented as product principle; needs real-world tuning

Ferocity should interrupt immediately only for:

- High-value lead.
- Lost lead risk.
- Customer complaint.
- Negative review.
- Payment failure.
- Large overdue invoice.
- Provider/webhook failure.
- Safety/legal issue.
- Low-confidence AI action.
- Human approval required.

Everything else should be batched into the Daily Brief or command center queue.

## 6. Mobile And Worker Reality Test

Status: needs repeated manual QA

Test at phone width:

- Owner Command Center.
- Managed Operator.
- AI Workforce.
- Employee app.
- Crew day.
- Receipts.
- Time entries.
- Jobs and bids.
- Invoice/payment follow-up.
- Push notification status.

The goal is that a normal owner or worker can complete work without learning the whole platform.

## 7. Public Message

Status: mostly implemented; keep polishing

Plain promise:

> Ferocity watches the work queue, prepares the next step, and brings important decisions to you.

Support it with concrete examples:

- Follow up with leads.
- Track jobs and bids.
- Plan worker days.
- Collect unpaid invoices.
- Request reviews.
- Create useful marketing.
- Keep owner attention on money, risk, and decisions.

Avoid:

- Fake live provider claims.
- Internal admin language.
- Overly technical setup wording.
- Long repetitive blocks.
- Guaranteed revenue promises.

## 8. Final Deploy Gate

Status: no frontend deploy until requested

Before a frontend deploy:

- `npm run typecheck`
- `npm run lint`
- `npm run public:guard`
- `npm run build`
- Manual check of public pages and logged-in command center.
- Verify the current Netlify target before deploying.
