# Public Growth Funnel Checklist

Goal: package the existing Ferocity lead generation pieces into one clear acquisition funnel instead of scattering people across separate pages.

Important: this funnel pattern is for Ferocity customers too, not only for Ferocity's own marketing. A customer's business should be able to use an audit, quiz, or offer funnel to create qualified leads, short proof clips, follow-up, and source-to-revenue tracking.

Flow:

1. Public growth-system page explains the offer.
2. Visitor runs the free Business Grader.
3. Report shows score, gaps, missed revenue estimate, and next actions.
4. Visitor watches the Ferocity walkthrough.
5. Qualified visitor requests setup or chooses a plan.
6. Ferocity records lead source, business fit, bottleneck, urgency, and requested path.
7. Setup starts safely without pretending live ads, publishing, messaging, or payments are enabled.

Implemented:

- [x] Added `/growth-system` public funnel page.
- [x] Added `/free-business-audit` alias to the same funnel.
- [x] Linked the funnel from the homepage, pricing page, sitemap, and robots allowlist.
- [x] Reused existing Business Grader, Start, pricing, and access request flows.
- [x] Added extra qualification fields to access requests without creating a duplicate funnel database.
- [x] Added report-page links back into the growth-system walkthrough.
- [x] Added logged-in `/app/growth-funnels` customer funnel engine surface.
- [x] Updated Marketing OS to point customers toward Growth Funnels.
- [x] Kept video language short-form focused instead of pushing a long two-minute video.
- [x] Added safe defaults so funnel launch-kit forms submit to existing Marketing OS actions.
- [x] Wired the customer funnel package through the Ferocity AI service for strategy, qualification questions, creative angles, follow-up, tracking, and video-brief direction.
- [x] Kept a deterministic fallback if AI is disabled, unavailable, or over limit.
- [x] Preserved honest language: no fake booked calendar, ad feedback, live publishing, or automatic sends.
- [x] Run local verification.
