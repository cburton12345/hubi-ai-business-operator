# Ferocity AI model and cost audit

Status: routing and accounting foundation implemented locally; active production model unchanged; no frontend deployment.

## Live synthetic compatibility evaluation

On 2026-08-01, the configured Ferocity OpenAI account was used to run five synthetic, non-customer test cases through the same Chat Completions JSON interface used by the application. The cases covered setup honesty, owner escalation, public-chat handoff, construction safety, and read-only adapter selection.

| Model | Passed | Average latency | Estimated test cost | Decision |
| --- | ---: | ---: | ---: | --- |
| GPT-4.1 Mini | 5/5 | 4.22 seconds | $0.002534 | Keep as the production default |
| GPT-5 Nano, minimal reasoning | 2/5 | 4.12 seconds | $0.000934 | Do not activate; failed schema/safety requirements |
| GPT-5.4 Nano, no reasoning | 5/5 | 3.14 seconds | $0.002976 | Promising quality/latency candidate, but not a demonstrated cost saving |

GPT-5 Nano returned an invalid triage schema, understated an electrical-water safety risk, and wrapped the adapter manifest instead of returning the required shape. GPT-5.4 Nano passed the five preliminary checks and was faster, but used 2,265 completion tokens versus 1,401 for GPT-4.1 Mini, making this small sample approximately 17 percent more expensive despite its lower published token rates. This is not enough evidence to change production.

The evaluation also exposed a real compatibility defect: the adapter-manifest prompt did not literally include the word `JSON`, which OpenAI requires when `response_format: { type: "json_object" }` is used. The shared AI service now guarantees that instruction for every JSON request, and a regression test covers the safeguard.

The repeatable command is `npm run ai:model:eval`. It loads the existing local OpenAI credential without printing it, uses synthetic data only, and does not write production records. Optional environment controls are `AI_EVAL_MODELS` and `AI_EVAL_RUN_TYPES`. The suite now also covers draft-only weekly marketing and guarded growth-funnel strategy. The latter exposed incompatible model field types, so the live workflow now normalizes every field against a safe typed fallback before use.

## Executive decision

Do not move every Ferocity workflow to GPT-5.6 Luna merely because it is the least expensive GPT-5.6 tier. Ferocity currently uses `gpt-4.1-mini`, whose official standard price is $0.40 per million input tokens and $1.60 per million output tokens. GPT-5.6 Luna is $1 input and $6 output, so Luna would increase Ferocity's cost for the observed workload by approximately 227 percent.

The actual cost-reduction candidates are GPT-5 Nano ($0.05 input / $0.40 output) and GPT-5.4 Nano ($0.20 input / $1.25 output) for tightly bounded tasks that pass quality and safety evaluations. GPT-5.6 Terra and Sol are quality upgrades for harder work, not cost-saving replacements for Ferocity's current default.

Official sources:

- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-5.6 launch pricing](https://openai.com/index/gpt-5-6/)
- [GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [GPT-5 Nano](https://developers.openai.com/api/docs/models/gpt-5-nano)
- [GPT-5.4 Nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano)

## Complete current LLM inventory

Ferocity has one shared text/vision execution service and eight discovered run types. BYO OpenAI credentials reuse the same guarded service for explicitly eligible workflows. Voice models configured inside Retell/Vapi and video-generation models are separate provider costs and are not text-token substitutions.

| Run type | Customer purpose | Requirement | Current recommendation |
| --- | --- | --- | --- |
| `receipt_vision_extraction` | Extract bookkeeping fields from a receipt image | Economy, vision, reviewable | Evaluate GPT-5.4 Nano against the current model; do not use text-only cost assumptions for image tokens |
| `construction_field_log` | Turn a field note into structured progress and risk drafts | Balanced; safety-sensitive | Keep current model until GPT-5.4 Nano passes missed-risk and hallucination tests |
| `owner_command_event_triage` | Decide what requires owner attention | Balanced; under-escalation is costly | Keep current model; evaluate GPT-5 Nano only with a zero-unsafe-under-escalation gate |
| `public_website_chat_reply` | Customer-facing website intake | Balanced; latency and trust matter | Keep current model; Luna is a quality/latency experiment, not a cost saving |
| `setup_guidance` | Rank missing setup and recommend next actions | Balanced | Keep current model initially; it already costs fractions of a cent per call |
| `weekly_marketing_plan` | Produce a guarded weekly marketing mix | Balanced | Keep current model; compare Luna/Terra only if measured quality raises customer value |
| `growth_funnel_strategy` | Build a multi-channel funnel and creative plan | Advanced | Evaluate Terra for quality; retain deterministic safeguards and approval gates |
| `adapter_factory_manifest` | Select minimal read-only operations from normalized API data | Advanced and security-sensitive | Evaluate Terra/Sol only for quality; volume is low, so correctness dominates token price |

No active LLM call was found for complex estimating, legal conclusions, payment execution, schedule changes, or contract decisions. Those systems remain deterministic, human-reviewed, or provider-specific. Do not advertise an expensive-model lane where no such call exists.

## Measured production usage

The last 30 days contained 25 recorded text calls:

- `setup_guidance`: 24 calls, 43,650 input tokens, 17,335 output tokens.
- `owner_command_event_triage`: one call, 341 input tokens, 132 output tokens.
- Total: 43,991 input and 17,467 output tokens.
- Recorded provider cost: approximately $0.043; recalculation at the official `gpt-4.1-mini` rates is approximately $0.046.

The difference is rounding and the historical global estimator. Future events use model-specific input, cached-input, and output prices.

## Cost comparison on the observed token mix

| Model | Cost for observed 30-day tokens | Change from current |
| --- | ---: | ---: |
| GPT-4.1 Mini | $0.0455 | baseline |
| GPT-5 Nano | $0.0092 | 79.8% lower |
| GPT-5.4 Nano | $0.0306 | 32.7% lower |
| GPT-5 Mini | $0.0459 | 0.9% higher |
| GPT-5.6 Luna | $0.1488 | 226.7% higher |
| GPT-5.6 Terra | $0.3720 | 716.8% higher |
| GPT-5.6 Sol | $0.7440 | 1,533.5% higher |

At 100,000 calls per month with the same average token mix, the approximate costs would be $182 for GPT-4.1 Mini, $37 for GPT-5 Nano, $123 for GPT-5.4 Nano, $596 for Luna, $1,488 for Terra, and $2,976 for Sol. This scenario is a linear token-cost illustration, not a forecast of customer activity or model output length.

## Implemented safely

- Added economy, balanced, advanced, and vision model lanes.
- Kept every lane falling back to the existing `AI_MODEL`, so production behavior does not change until a lane is deliberately configured.
- Preserved BYO credential selection, tenant isolation, service gates, cost caps, fallbacks, concurrency controls, and usage records.
- Added model-specific price accounting for current candidate models.
- Added cached-input pricing and provider-reported cached-token storage.
- Preserved explicit emergency price overrides for future provider price changes.

## Evaluation and activation plan

1. Expand the initial five-case synthetic evaluation into multiple examples for each run type, including receipt-image fixtures.
2. Compare the current model with one candidate at a time and repeat cases to measure consistency.
3. Score schema validity, factual grounding, unsafe omissions, hallucinations, latency, input tokens, cached tokens, output tokens, and exact provider cost.
4. Activate GPT-5 Nano or GPT-5.4 Nano only where quality is non-inferior and safety gates pass.
5. Test Luna/Terra/Sol only where the additional quality can increase conversion, avoid meaningful risk, or replace expensive human effort.
6. Roll out by environment variable one lane at a time and keep the previous model available for immediate rollback.

## Additional savings

- Keep stable instructions first and variable customer data last so repeated prefixes can be cached.
- Track cached-token rate by run type before using explicit cache writes; GPT-5.6 cache writes cost more than ordinary input while reads receive a discount.
- Cap unnecessary output with compact schemas and short customer-facing responses; Ferocity already uses JSON and concise prompts in most calls.
- Batch only offline, non-customer-facing planning where delay is acceptable. Do not batch live chat, safety triage, receipt review, or interactive setup.
- Reuse deterministic fallbacks for predictable work instead of calling a model merely because one is available.
- Do not send full customer histories when a bounded summary or last few turns are sufficient.
