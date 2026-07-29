# AI Marketing Department Audit

## Audit Summary

Ferocity already has the right foundation for an AI Marketing Department. The correct path is to expand the existing Marketing OS, Business Info, AI Workforce, Growth Calendar, SEO/GEO engine, Customer Proof, Review Queue, Action Queue, and Owner Command systems.

Do not create a separate Zeely-style app. Marketing should operate as one department inside the existing AI Workforce.

## Existing Features Reused

- Marketing OS: `/app/marketing-os`
- Growth Calendar: `/app/growth-calendar`
- SEO/GEO tools: `/app/seo`
- Customer Proof and UGC: `/app/proof`
- Reviews: `/app/review`
- Business Info: `/app/business-brain`
- AI Workforce: `/app/ai-workforce`
- Action Queue: `/app/actions`
- Publishing Hub and review-first export queue
- Website import and website connector records
- Content Studio campaigns and outputs
- Marketing media assets
- Graphic jobs
- Video ad briefs
- Owner Command Center
- Automation Timeline
- Leads, customers, jobs, invoices, and revenue records

## Gaps Found

- Business Info had useful facts but needed clearer Brand Intelligence structure for audience, offers, proof, seasonality, capacity, and marketing rules.
- Marketing OS stored campaigns and outputs but lacked long-term Marketing Memory for what works.
- The SEO/marketing AI agent was too shallow and mostly created one generic SEO draft.
- Campaign planning did not yet use operational signals such as open crew capacity, completed jobs, proof, reviews, revenue goals, or lead shortages.
- Marketing department wording existed in AI Workforce but was not strongly reflected inside Marketing OS itself.
- Provider support for Meta, Google, TikTok, YouTube, Reddit, Microsoft, LinkedIn, and future managed advertising needed to stay as provider-ready architecture, not fake live publishing.

## Implementation Direction

Reuse Marketing OS as the department. Add:

- Brand Intelligence JSON fields on marketing business profiles.
- Marketing Memory records.
- Campaign recommendation records.
- More campaign blueprint outputs.
- A stronger SEO/marketing agent that prepares campaign recommendations, content drafts, strategy items, and review-first export work.

## Safety

All public/customer-facing marketing output remains review-first. Ads, videos, publishing, SMS, email, and provider actions should remain gated by controls, provider credentials, approvals, and plan limits.
