# Public Site Overhaul Checklist

Source prompts consolidated:
- Ferocity Product Architecture & UX Overhaul
- First-Time Customer Review
- Critical QA Fixes
- AI Marketing Department / Brand Intelligence
- Revenue Growth Engine

## Core Positioning

- Ferocity is an AI operating system for modern businesses.
- Lead with one clear promise: Ferocity helps owners take their life back by automating approved business work.
- Use money leaks and missed opportunities as supporting proof, not the main headline.
- Do not make Ferocity sound only like contractor software, CRM software, SEO software, or marketing automation.
- Keep service businesses as the first practical beachhead, but leave room for other businesses.
- Use plain words. Avoid abstract overload.
- Main CTA: run the free business grader.
- Secondary CTA: watch the loop / see demo.

## Trust Rules

- No internal product-planning notes on public pages.
- Do not imply messages, ads, publishing, payments, or integrations are live unless connected.
- Label states clearly: Available now, Setup required, Connected account required, Draft first, Beta, Coming soon.
- Explain optional fees simply and visibly.
- Do not overpromise guaranteed revenue.
- Keep owner approval and control clear, but do not repeat it endlessly.

## Public Buyer Path

1. Homepage: clear promise, simple outcomes, real workflow loop, visible proof/status, direct CTA.
2. Demo: show the operating loop in plain English, not a wall of feature text.
3. Features: organize by business outcomes and availability, not database modules.
4. Pricing: simple plan table, optional fees explained, no ambiguity.
5. Start: progressive setup path, not a confusing API/config form.

## Product Architecture Principles

- One platform, two ways to use it:
  - AI Guided Mode for normal owners.
  - Traditional Mode for power users/admins.
- Do not create duplicate CRM, campaign, lead, job, invoice, or content systems.
- AI should orchestrate existing Ferocity functionality.
- Marketing is a department inside the AI Workforce, connected to business knowledge, CRM, jobs, reviews, revenue, and attribution.
- Revenue Growth connects marketing spend to qualified leads, appointments, estimates, jobs, invoices, collected revenue, profit, reviews, and repeat business.

## Implementation Tasks

- [x] Replace bloated homepage with sharper, shorter value proposition.
- [x] Replace demo with a clearer visual workflow and fewer paragraphs.
- [x] Replace features page with outcome/status-based organization.
- [x] Replace pricing page with simple tiers and optional-fee clarity.
- [x] Remove development/internal language from public pages.
- [x] Keep Free Grader as dominant CTA.
- [x] Keep Start path for people ready to request access.
- [x] Run tests/typecheck/lint/build before any deploy.
- [x] Do not deploy until explicitly approved.

## Completed In This Pass

- Rebuilt the homepage around one promise: Ferocity helps owners take their life back by automating approved business work.
- Rebuilt the demo page around the business loop: audit, lead, follow-up, work, money, proof, growth.
- Rebuilt the features page around outcomes instead of buried modules.
- Rebuilt pricing so plans, setup requirements, optional fees, and connected-account limits are clearer.
- Kept the free Business Grader as the main public CTA.
- Kept `/start` as the access/setup request path for people ready to move forward.
- Removed public wording that sounded like roadmap notes or internal planning.

## Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run public:guard`: passed.
- Public copy scan for roadmap/internal/fake-live phrasing: passed.

## Verification

- Public pages should answer:
  - What is Ferocity?
  - Is it for me?
  - What does it actually do now?
  - What requires setup or connected accounts?
  - What does it cost?
  - What should I click first?
- Check desktop and mobile for no horizontal overflow.
- Check no public copy says live/active/sent/published unless backed by actual state.
