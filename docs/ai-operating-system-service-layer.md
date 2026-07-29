# Ferocity AI Operating System Service Layer

## North Star

Ferocity should feel less like a set of AI tools and more like an AI operating system for the business.

The owner should think:

- "I finished a job."
- "This lead needs handled."
- "This invoice needs collected."
- "This week needs more booked income."

They should not have to think:

- "Which AI model should I use?"
- "Which video generator should I open?"
- "Which page has the marketing tool?"

Ferocity should watch the work queue, prepare the next step, and bring important decisions to the owner.

## Architecture Requirements

1. All AI provider calls go through one Ferocity AI service layer.
2. Pages and workflow modules must not call OpenAI, Google, Runway, Kling, or other providers directly.
3. Providers are interchangeable through adapter/config changes.
4. Core AI work should feel unlimited for normal business use.
5. Expensive media generation is isolated from regular AI assistance.
6. Usage is tracked by workspace, user, provider, model, feature, category, cost, tokens, and media units.
7. Caps, emergency pause, provider status, and premium media limits protect Ferocity's operating costs.
8. Users pick business outcomes, not models.

## AI Categories

Core AI:

- Setup guidance
- Owner command responses
- Summaries
- Lead follow-up drafts
- Estimate/proposal language
- Email and message drafts
- Scheduling guidance
- Business recommendations
- Receipt/expense extraction when reasonable

Premium media:

- AI video generation
- Large image batches
- Premium voiceover
- Expensive future models
- High-volume creative rendering

Core AI should be available broadly with sane monthly safety controls. Premium media can use plan limits, credits, or explicit paid upgrades.

## Provider Abstraction

Ferocity AI service owns:

- Provider selection
- Model selection
- Cost category
- Feature gate
- Rate/budget checks
- Provider call
- Fallback behavior
- Usage logging
- Safe error logging

Current adapter:

- OpenAI chat/completions for JSON and vision-style JSON extraction.

Prepared adapters:

- Future OpenAI video/image/voice
- Google Veo
- Runway
- Kling
- Other image/video/voice providers

## Post-Job Workflow Vision

When a job is marked complete, Ferocity should be able to prepare an optional pipeline:

1. Score marketing potential.
2. Select best photos/videos.
3. Organize before/after proof.
4. Draft customer thank-you.
5. Draft review request.
6. Draft referral request.
7. Draft GBP/social posts.
8. Draft website portfolio entry.
9. Draft short-video script/storyboard before expensive rendering.
10. Ask for approval or run only what the workspace allows.

Potential outputs:

- Facebook Reel
- Instagram Reel
- TikTok
- YouTube Shorts
- Google Business Profile post
- Facebook post
- Website portfolio page
- Customer thank-you email
- Review request
- Referral request
- Before/after gallery
- Captions
- Voiceover script
- Thumbnail prompt

## Brand Brain

Every company should have persistent business memory used by all AI systems:

- Logo, colors, fonts, slogan
- Tone and writing style
- Service area and priority services
- Preferred CTA
- Preferred platforms
- Social links
- Watermark/style preferences
- Video and image style
- Preferred audience
- Past jobs, reviews, proof, FAQs, warranties, documents

## Cost Strategy

Ferocity should create one excellent version first.

Before rendering expensive media:

- Write the script.
- Build the storyboard.
- Use existing proof when possible.
- Decide whether video is actually worth it.
- Prefer slideshow/editing/photo animation when that creates enough value.

Follow-up options can include:

- Make it shorter
- Make it more cinematic
- Make it more educational
- Make it more emotional
- Target homeowners
- Target commercial customers
- Make it feel more premium

## Implementation Checklist

- [x] Make core AI available from the Free plan with limits.
- [x] Document AI operating system and post-job workflow requirements.
- [x] Add AI provider/config tables and usage ledger migration.
- [x] Add central AI service abstraction.
- [x] Keep existing AI call sites compatible.
- [x] Move receipt OCR/vision behind the AI service.
- [x] Add AI control/cost dashboard shell.
- [ ] Move remaining future media providers behind adapters as they become real.
- [ ] Add post-job marketing opportunity score.
- [ ] Add completed-job automation trigger to create proof/review/content draft bundle.
- [ ] Add configurable Brand Brain style preferences beyond current business profile memory.
- [ ] Add budget enforcement beyond logging: monthly caps, emergency kill switch, user/company caps.
- [ ] Add premium media credit/limit UI.

## Rule

No fake live claims. Ferocity can prepare, draft, log, and queue today. Posting, sending, spending, rendering, or charging only happens when the provider, credentials, plan, limits, consent, and approval mode allow it.
