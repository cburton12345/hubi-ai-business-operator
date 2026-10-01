# AI Growth Department — audit and implementation

## Decision

Ferocity already had the core operating pieces. This work extends them rather than adding a separate product, duplicate CRM, second campaign system, or another dashboard.

The existing `/app/growth` experience remains the owner surface. The existing Growth Distribution Engine remains the opportunity, identity, policy, action, event, and attribution layer. Marketing OS remains the business profile, Brand Voice, campaign, and memory layer. Existing communications, approval/autopilot controls, CRM, website intelligence, SEO, analytics, and Ferocity Earn remain authoritative.

## Capability audit

| Capability | Before this pass | Implementation direction |
| --- | --- | --- |
| Business, service, location, audience and brand context | Partial/full | Reuse brands, services, locations and Marketing OS profiles. Add evidence-backed learning memory. |
| Brand Voice / Voice Bank | Partial | Reuse `brand_voice`, marketing rules and Growth policies. Add durable voice/customer-language evidence and confidence. |
| Community and conversation discovery | Strong foundation | Reuse Growth communities/opportunities and connector capability truth. Never imply access a connector does not provide. |
| Contextual replies/posts | Partial/full | Reuse opportunity context, content generation, quality review, approval and publishing queues. External action remains policy-gated. |
| Competitor intelligence | Partial | Store only sourced competitor observations and meaningful changes in Marketing Memory; never invent competitors or scrape prohibited sources. |
| Website, landing-page, SEO and GEO intelligence | Strong foundation | Reuse website imports, grader, SEO opportunities, content quality and landing pages; feed the best gaps into daily prioritization. |
| Email nurture and follow-up | Strong foundation | Reuse connected mailbox/messaging and follow-up workflows. No duplicate email system. |
| Customer discovery | Partial | Learn from existing leads, conversations, calls/messages, reviews, wins/losses and attribution, with evidence and confidence. |
| Closed-loop attribution | Strong foundation | Reuse Growth events/touches, CRM entities, invoices/revenue and Earn attribution. Optimize for revenue/profit, not engagement alone. |
| Daily prioritization | Missing/weak | Add a maximum-five action Growth Department briefing with automatic, approval and personal involvement levels. |
| Organic-first strategy | Partial | Make organic-first explicit on each recommendation. Paid spend is never automatically authorized. |
| Continuous learning | Partial | Add evidence, confidence, first/last observation and expiry to Marketing Memory; preserve action learning fields. |

## Safety and truth rules

- Use only supplied or collected evidence. Do not invent competitors, market facts, customer language, claims or provider access.
- Prefer organic help, useful content, follow-up, reputation, referral, website and conversion improvements before recommending ad spend.
- External posting, outreach, claims and spend use existing workspace policies and approvals.
- `automatic` is reserved for safe internal analysis or work already authorized by an explicit policy. `approval` covers external prepared work. `personal` means a true owner decision or missing business knowledge.
- A connector being listed is not evidence that it is authenticated, available or permitted.
- Attribution remains source → interaction → lead → estimate/job → invoice/payment → revenue/profit, including Ferocity Earn where applicable.

## Owner experience

The existing Growth screen summarizes worthwhile actions found today, how many were safely handled, how many need approval, and how many genuinely require the owner. It shows only the highest-value actions, with the evidence and reason each is timely.

Ferocity also scores the business loop itself across foundation, lead capture, follow-up, proof, organic content, sales conversion, money, and closed-loop learning. Recommendations carry the capability they improve and an execution state—suggested, prepared, waiting approval, executing, blocked, completed, or measuring—so the platform distinguishes advice from work it actually performed. Effectiveness is only populated from measured outcomes.

A guarded daily background sweep uses the existing AI entitlement, service gate and budget controls. It runs at most once per workspace per day, records the briefing in the existing operator timeline, and never turns paid spend into an automatic action.

## Operating loop

Understand the business → learn the market, customer and competitors → discover opportunities → rank by value and confidence → execute authorized internal work or request approval → capture and nurture leads → convert → attribute revenue/profit → learn → repeat.

## AI Content Production Engine

The Growth Department can turn a sourced recommendation into an existing Content Studio campaign using Marketing OS business context, Brand Voice and rules, Marketing Memory, live conversation opportunities, customer proof and only media explicitly approved for AI reuse. It produces platform-native variations rather than one generic post copied everywhere: useful social posts, Stories, text-video or B-roll concepts, short-form/UGC scripts, captions, email and longer-form content where the evidence supports them.

Every output records its audience and message hypotheses, source evidence, variant group and quality result. Short-video concepts enter the existing video-job review path without submitting a provider job or consuming premium rendering credits.

Performance learning uses the existing Growth events and attribution touches. Content becomes a `winner` only after a business signal—won revenue, a customer win, or multiple attributed leads. Engagement alone can mark a concept `promising`, but cannot justify calling it a winner. Proven winners create an approval-required paid-amplification recommendation; they never authorize or launch ad spend.

## Deployment

No frontend or production deployment is part of this implementation pass.
