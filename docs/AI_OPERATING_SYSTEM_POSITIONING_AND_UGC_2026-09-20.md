# Ferocity AI Operating System and UGC pass

Date: 2026-09-20

## Position Ferocity owns

Ferocity is the AI operating system for running a business. The AI Workforce remains important, but it operates inside the shared Business Brain rather than being sold as a bag of generic bots.

The durable distinction is:

- General-purpose AI workers: potentially excellent execution engines that can become more useful when they have structured business context and controlled actions.
- Ferocity: the business operating system that understands the lifecycle, notices what changed, determines what should happen next, coordinates native or approved connected workers, applies saved authority, and preserves an auditable result.

The business layer owns customers, work, conversations, money, schedules, history, permissions, approvals, cost controls, and learning. The execution runtime is replaceable infrastructure. The native runtime now sits behind `src/lib/ai-workforce/execution-runtime.ts`; future connected runtimes must still pass through Ferocity context, authority, audit, and cost controls.

Ferocity is deliberately agent-agnostic: it ships with a native AI Workforce, while the provider-neutral action layer in `src/lib/business-actions/` defines the same controlled business surface future outside agents can use. No named outside-agent compatibility is public or certified yet.

## Product and copy changes

- Homepage metadata and comparison copy now lead with “AI operating system,” not “AI employees.”
- The comparison now shows Ferocity coordinating tools and AI workers instead of treating general-purpose agents as enemies.
- Ask Ferocity routes an outcome to operating departments and systems through the Business Brain.
- AI Workforce customization is framed as department roles and workflows, while preserving the existing functionality.
- Owner Command Center explains that the AI Workforce is a coordinated set of operating departments, not disconnected bots.

## Native UGC production

UGC is now a governed content-production mode in Video Ad Studio rather than a vague visual style. A UGC plan records:

- immediate audience/problem hook;
- natural spoken-language direction;
- actor, testimonial, and synthetic-media safeguards;
- provider capabilities needed for references, natural voice, lip-sync, captions, and localization;
- generation, assembly, quality-review, approval, and publishing stages;
- multiple hook variations without fabricating customer experiences.

Ferocity still treats provider choice as an implementation detail. Google Veo remains the economical managed source-footage provider. ElevenLabs is a strong future assembly option for voice, lip-sync, localization, and multi-model video, but its Image & Video API requires a Pro plan and workspace permissions. Its Ads Engine is not currently available by API, so Ferocity must not pretend that product is a programmable publishing backend.

Official references:

- Google Veo API and models: https://ai.google.dev/gemini-api/docs/veo
- Google Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- ElevenLabs Image & Video capabilities: https://elevenlabs.io/docs/overview/capabilities/image-video
- ElevenLabs Image & Video API quickstart: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video
- ElevenLabs Ads Engine limitations: https://elevenlabs.io/docs/overview/capabilities/ads-engine

## Customer pricing defaults

- Managed source render: $0.25 per generated second.
- Finished UGC-style package: $15 up to 15 seconds.
- Finished UGC-style package: $25 up to 30 seconds.
- Additional variations of the same approved concept: 40% of the base package each.
- Extra actors, languages, custom digital twins, or materially different concepts require a new quote before work begins.

These are customer prices, not a promise to use the cheapest model. Ferocity selects an approved provider/model inside the cost ceiling and shows the exact total before submission. Environment overrides exist for pricing changes, but the customer must still approve the resulting price.

## Billing correction

A source render reservation is now held while the provider works. The customer usage charge is created only after the provider reports successful completion. A later provider failure marks the usage event failed, zeros the cost and customer charge, and voids any non-invoiced legacy charge. This prevents provider acceptance from being mistaken for delivered video.

## Honest remaining activation work

- Add and certify an ElevenLabs Pro workspace only if its UGC assembly economics beat the current direct-provider/local-finishing path.
- Run representative UGC evals for face/identity consistency, natural delivery, captions, brand accuracy, and conversion quality before promoting automatic production.
- Keep channel publishing capability-verified. A finished asset can be approved and exported today; automatic posting is live only where the destination adapter is certified.
- Apply migrations and deploy only when the owner authorizes the final frontend release.
