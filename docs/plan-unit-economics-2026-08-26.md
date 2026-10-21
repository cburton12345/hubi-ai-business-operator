# Ferocity plan unit economics

Status: recalculated locally on 2026-10-16 for the September 2026 commercial-reset catalog; this is planning evidence, not cash-ledger proof.

## Decision

Keep the current public subscription prices and keep Operator at 300 included managed voice minutes.

Operator's included managed voice plus one phone number is approximately 5.05% of its $699 subscription. The complete model does not justify weakening the allowance: Operator models at approximately 89.0% gross margin under normal use and 83.6% under the deliberately conservative heavy-use scenario.

Use this customer rule:

> The Ferocity operating system stays available. A plan includes a meaningful allowance for managed provider usage. Managed calling continues at the disclosed pay-per-use price after the allowance unless the customer chooses an optional monthly limit.

Do not call every feature unlimited. Advertising spend, payment processing, rendered video, high-volume messaging, large storage needs, and unusual third-party usage are customer-funded, bring-your-own, pay-per-use, or upgrade-triggering costs.

## Current prices and included voice

| Plan | Monthly price | Included managed voice | Voice after allowance |
| --- | ---: | ---: | ---: |
| Job Tracker | $39 | None | Not included |
| Ferocity Calls | $49 | None | $0.25/completed minute |
| Starter | $149 | 25 minutes | $0.25/completed minute |
| Growth | $349 | 100 minutes | $0.25/completed minute |
| Operator | $699 | 300 minutes | $0.25/completed minute |

Managed Operator remains custom-priced and should not be margin-certified until its written service scope and human time are priced.

## Cost assumptions

| Cost | Audit assumption | Basis |
| --- | ---: | --- |
| Subscription payment | 2.9% + $0.30 | Standard domestic online card rate; custom or international pricing can differ |
| Managed voice | $0.111/minute | Retell infrastructure, platform voice, GPT-4.1 mini, telephony, knowledge base, and denoise estimate |
| Managed US phone number | $2/month | Regular Retell-managed number; toll-free costs more |
| Text AI | $0.00182/run | Observed Ferocity 30-day token mix on GPT-4.1 mini |
| Transactional email | $0.001/email | Application's conservative configured estimator; Resend paid overage is currently lower |
| Shared infrastructure | Scenario allocation | Conservative allowance for Netlify, Supabase, monitoring, bandwidth, compute, storage, and pooled services |

Official pricing references:

- Stripe: https://stripe.com/pricing
- Retell: https://www.retellai.com/pricing
- Resend: https://resend.com/pricing
- Supabase: https://supabase.com/pricing
- Netlify: https://www.netlify.com/pricing/

The repeatable model is `node scripts/plan-unit-economics.mjs`.

## Modeled margins

The heavy scenario consumes every included AI run, every included voice minute, more transactional email, and a large shared-infrastructure allocation. It excludes optional provider work that is already separately funded or billed, such as ad spend, premium video, SMS provider charges, and customer payment processing.

| Plan | Light margin | Normal margin | Heavy margin |
| --- | ---: | ---: | ---: |
| Job Tracker | 95.0% | 93.5% | 87.9% |
| Ferocity Calls | 90.8% | 89.1% | 81.2% |
| Starter | 92.6% | 91.4% | 87.4% |
| Growth | 92.2% | 90.7% | 86.3% |
| Operator | 90.9% | 89.0% | 83.6% |

These are planning estimates, not accounting results. The provider-cost dashboard must compare recorded usage to actual provider statements monthly. Alert below 70% estimated gross margin and require review below 60%.

## What is safely included

- Core workspace, dashboards, records, workflows, deterministic automation, and customer/employee portals.
- Normal Business Brain text work. Current token cost is very small, and every plan already has an internal AI-run allowance for cost monitoring.
- Transactional email at normal operating volumes.
- The plan's stated managed voice allowance and one regular managed number when selected.

## What must remain separate

- Managed voice above the included allowance: $0.25 per completed minute.
- Premium rendered video: charged per rendered second only when profitable provider and customer rates and budgets are configured.
- SMS/MMS: customer-owned provider or disclosed usage billing after a managed provider is certified.
- Advertising: prepaid customer wallet or direct customer provider billing; never absorbed by subscription revenue.
- Customer invoice payment processing: charged by Stripe or the connected processor; Ferocity's optional managed-payment fee is separate and disclosed.
- Large storage, high-volume marketing email, premium models, custom integrations, and hands-on managed service.

## Product and billing safeguards

- Paid voice policies have no hidden plan hard stop.
- Customers can add, change, or remove a monthly managed-voice overage limit from Billing.
- Removing the customer limit does not remove provider-cost ceilings, concurrency protection, abuse controls, fraud controls, failed-payment behavior, or global emergency stops.
- Disclosed voice overage is accumulated for the subscription invoice instead of forcing repeated checkout.
- Actual provider cost above the configured ceiling pauses that provider lane for investigation; it does not disable unrelated Ferocity features.

## Follow-up measurements

1. Reconcile Retell's monthly invoice against recorded call cost and replace the $0.111 estimate with the actual blended cost.
2. Record Netlify and Supabase monthly cost and allocate it by active workspace and usage driver.
3. Separate transactional from marketing email; customer-scale marketing should use a connected provider or a disclosed high-volume price.
4. Add storage overage or upgrade handling before advertising storage as uncapped.
5. Re-run this model when a provider price, model, plan allowance, or public price changes.
