# Native AI Video Generation

## UGC and customer pricing update (2026-09-20)

Video Ad Studio now treats UGC as a full production workflow: audience-led hooks, natural spoken scripting, actor/testimonial safeguards, reference-aware generation, voice/lip-sync capability planning, captions, CTA, quality review, approval, and reusable channel cuts. Customer pricing defaults are $0.25 per generated source second, $15 for a finished UGC-style package up to 15 seconds, and $25 up to 30 seconds. Provider failures are not completed customer charges.

Google Veo remains the economical source-footage route. ElevenLabs is documented as a provider-neutral future assembly route for natural voice, lip-sync, localization, and multi-model generation; activation requires a Pro plan, the correct API permissions, cost validation, and production certification.

Updated: September 20, 2026

## Decision

Ferocity's native video workflow uses the existing provider-independent Video Ad Studio and managed-usage infrastructure. Google Veo 3.1 Lite through the Gemini Developer API is the default launch model. It is currently the best fit because Ferocity already has the Google provider path, it supports text-to-video and image-to-video, it generates audio, it supports 9:16 and 16:9, and its official 720p price is $0.05 per generated second.

Runtime note: the linked Netlify production environment was still configured as `openai` / `sora-2` during this implementation. The Google adapter is ready, but production must receive a Gemini video API key and the environment switch below before the new default is live. Ferocity automatically treats the legacy OpenAI configuration as unavailable on or after the announced shutdown date rather than attempting paid work against a retired endpoint.

OpenAI Sora 2 remains in the adapter only for existing jobs. OpenAI marks the current Videos API as deprecated and scheduled to shut down on September 24, 2026, so new production work must not depend on it.

No Runway or Luma account is required for launch. Their capabilities are recorded in the provider registry so either can be added behind the same interface when redundancy or a capability gap justifies another paid dependency.

Official research:

- Google Veo capabilities: <https://ai.google.dev/gemini-api/docs/veo>
- Google Veo pricing: <https://ai.google.dev/gemini-api/docs/pricing>
- OpenAI video API lifecycle and input reference support: <https://developers.openai.com/api/reference/typescript/resources/videos/methods/create>
- OpenAI Sora 2 pricing: <https://developers.openai.com/api/docs/models/sora-2>
- Runway API pricing: <https://docs.dev.runwayml.com/guides/pricing/>
- Runway input and aspect-ratio support: <https://docs.dev.runwayml.com/assets/inputs/>
- Luma video generation API: <https://docs.lumalabs.ai/docs/video-generation>

## 1. What was added

- Capability-aware provider registry for Google Veo, legacy OpenAI Video, evaluated Runway, and evaluated Luma.
- Native image-guided Veo generation from up to three approved direct image URLs. Veo Lite uses the first image as the opening frame. Veo Standard/Fast can use up to three asset references and automatically uses the required eight-second duration.
- Plain-language concept creation that sends business name, site, Brand Voice, ideal customers, competitive advantages, and the approved media inventory to Ferocity's creative director before any provider spend.
- User-selectable economy, balanced, or premium preference. The configured provider/model and saved billing rates remain authoritative so a UI choice cannot silently create an unpriced charge.
- 9:16 and 16:9 source renders plus Ferocity's existing local finishing path for 1:1 and other channel cuts.
- Review-first variations. A user can request a new hook, scene direction, or format from an existing job without incurring another provider charge. Each variation is a separate, traceable video job.
- Existing safeguards were preserved: preflight claim review, approval gate, subscription check, usage billing, customer charge approval, global/workspace budgets, idempotency, async status refresh, provider-error normalization, quality inspection, local finishing, download, and production history.

## 2. Provider/model selected and why

Default: `google_veo` with `veo-3.1-lite-generate-preview` at 720p.

Why:

- Lowest official price among the directly connected, suitable providers: $0.05/second at 720p.
- Text and image inputs, native audio, and both social-first orientations.
- Uses the already implemented Google adapter and current server-side secret pattern.
- Preserves a clean upgrade path to `veo-3.1-fast-generate-preview` or `veo-3.1-generate-preview` when stronger reference handling or higher quality is worth the increased cost.

Ferocity does not silently change the configured model based on a user's quality preference. Model changes require an operator configuration/pricing change so cost accounting remains truthful.

## 3. Alternatives considered

| Provider | Practical strengths | Cost signal from official docs | Decision |
| --- | --- | --- | --- |
| Google Veo 3.1 Lite | Text/image input, audio, portrait/landscape, existing adapter | $0.05/sec at 720p | Launch default |
| Google Veo 3.1 Fast/Standard | Better quality tiers; Standard supports up to three references | Fast $0.10/sec at 720p; Standard $0.40/sec at 720p | Configurable upgrade |
| OpenAI Sora 2 | Natural-language and image input, existing adapter | $0.10/sec | Legacy only because current API shutdown is scheduled for Sep. 24, 2026 |
| Runway | Broad model router, square and additional ratios, strong reference support | Credits cost $0.01 each; model-dependent per-second pricing | Best next fallback candidate, not required now |
| Luma Ray 2 | Text/image generation, keyframes, callbacks, many aspect ratios | Pricing was not sufficiently clear in the cited generation reference | Keep as evaluated future adapter |

## 4. Required environment variables

All secrets remain server-side.

```text
VIDEO_PROVIDER=google_veo
VIDEO_API_KEY=<Gemini API key>
VIDEO_MODEL=veo-3.1-lite-generate-preview
VIDEO_RENDERING_ENABLED=true
VIDEO_MONTHLY_BUDGET_CENTS=<global hard cap>
VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS=<per-workspace hard cap>
VIDEO_PROVIDER_COST_CENTS_PER_SECOND=5
VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND=<approved profitable price greater than 5>
FEROCITY_USAGE_BILLING_ENABLED=true
```

Briefs and variations still work when live rendering is disabled. Do not enable live rendering with zero caps, missing billing, or a customer price at or below provider cost.

## 5. Estimated generation costs

Provider cost at Veo 3.1 Lite 720p:

- 4 seconds: $0.20
- 6 seconds: $0.30
- 8 seconds: $0.40
- A 15-second assembled ad normally uses multiple short source clips; two eight-second generations cost about $0.80 before retries, finishing, storage, or customer margin.
- A reference-image request on Veo Standard/Fast is forced to eight seconds by the provider. Ferocity reserves and records that effective duration before submission.

These are provider estimates, not promises of a finished-ad cost. Ferocity shows and records the approved customer charge before every managed render and does not automatically buy rerenders.

## 6. Where it appears in Ferocity

- `App -> Marketing OS -> Video Ad Studio`: plain-language video request, platform, duration, audience, variations, quality preference, and reference image URLs.
- `App -> Marketing OS -> Video Jobs -> job`: script, scenes, provider request, preflight, cost approval, live status, history, reference assets, quality review, finishing/export, and review-first variations.
- `App -> AI Usage` and `App -> Billing`: provider cost and approved customer usage charge.
- `App -> Review`: video briefs remain review-first before provider spend or publishing.

## 7. Automatic Marketing System invocation

The AI Content Production and Growth systems already create `marketing_video_jobs` from validated content opportunities. The native workflow now uses the same job contract as a manually requested video:

```text
business and brand context
-> audience/opportunity signal
-> concept, script, scenes, voiceover, CTA and variants
-> claim/creative preflight
-> human or saved-policy approval
-> capability-aware provider adapter
-> asynchronous render and status history
-> quality inspection and local finishing
-> publishing/scheduling gate
-> performance and revenue attribution
-> better future creative
```

Automatic systems may prepare briefs and variations. They may submit a paid render only when the existing service gate, subscription, usage-billing, approval, idempotency, and budget requirements all pass.

## 8. Later phase

- Add a second live provider adapter (Runway is the leading candidate) only when fallback capacity or a verified capability gap justifies it.
- Replace the legacy OpenAI adapter after OpenAI publishes a successor to the retiring Videos API.
- Let users choose approved Media Library assets directly rather than pasting a signed/public image URL. The planning system already includes the approved asset inventory; provider submission currently accepts direct image URLs.
- Add provider webhooks where useful so jobs can update without a manual refresh. Polling is already safe and functional.
- Add multi-clip timeline assembly with transitions, licensed music, generated/recorded voiceover, and browser-independent MP4 finishing. Existing finishing currently creates channel cuts from approved source footage.
- Add automated provider quality/cost evaluation based on real Ferocity outcomes before changing defaults.

## Operational rules

- Never expose provider keys to the browser.
- Never submit paid generation merely because a brief was created.
- Never reuse an uploaded asset unless its permission is approved.
- Never invent reviews, results, credentials, prices, guarantees, logos, or product behavior.
- Never mark a render as delivered until output retrieval and quality checks succeed.
- Never automatically rerender a bad result unless saved authority and budget explicitly permit it.
