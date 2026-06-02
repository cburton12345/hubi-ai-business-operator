# AI Workforce Completion Checklist

## Source Prompts Captured

Ferocity should feel like one platform with two ways to use it:

1. AI Mode
2. Traditional Mode

AI Mode is an orchestration layer over the existing Ferocity systems. It must not remove, replace, or duplicate CRM, reviews, website tools, content tools, automations, reporting, messaging, lead management, billing, customer portal, integrations, or settings.

The owner should be able to say things like:

- Get me more roofing leads.
- Help me get more reviews.
- Create a hail campaign.
- Set up my marketing.
- Improve my website.
- Follow up with old leads.
- Create Facebook ads.
- Build me a referral program.

Ferocity should use AI employees to plan, prepare, monitor, and optimize work while live sending, publishing, ads, sync, and spend remain gated by approvals and provider controls.

## Completion Status

- [x] Add AI Mode as an extra layer, not a replacement.
- [x] Keep Traditional Mode visible.
- [x] Create AI Workforce command center.
- [x] Show AI employee roles.
- [x] Add quick actions.
- [x] Preview which AI employees and systems handle a command.
- [x] Execute safe AI Mode commands into existing setup, marketing, SEO, action queue, and timeline records.
- [x] Log AI Mode activity in the existing operator timeline.
- [x] Preserve rollback/review behavior through setup operator logs.
- [x] Keep provider actions approval-gated.
- [x] Wire AI Mode into website import requests.
- [x] Process safe public website imports into review-ready Marketing OS facts.
- [x] Wire AI Mode into growth/service/operator monitoring scans.
- [x] Add safe scheduler/readiness stubs for future background AI employees.
- [x] Surface AI Mode prepared work and blocked items clearly.
- [x] Keep documentation current as features land.

## Remaining External Dependencies

These are intentionally not marked as code blockers because they require provider accounts, keys, or manual business approval:

- Live email/SMS sending requires verified provider keys, consent, and review.
- Live website/CMS publishing requires a connected CMS or manual export workflow.
- Live GBP/social/ad publishing requires provider OAuth, budgets, approvals, and plan limits.
- Advanced website crawling, JavaScript rendering, and multi-page CMS imports require the production crawler/provider choice.
- Scheduled AI Workforce monitoring requires `AI_WORKFORCE_CRON_TOKEN` and an external scheduler or Netlify scheduled trigger.

## Non-Negotiables

- No duplicate CRM records.
- No duplicate workflow engine.
- No duplicate campaign system.
- No duplicate content system.
- No hidden removal of Traditional Mode.
- No fake live sync claims.
- No live sends, publishing, ad spend, or provider sync without keys, consent, limits, and approval.
