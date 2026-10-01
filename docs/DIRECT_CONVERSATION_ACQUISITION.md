# Direct Conversation Acquisition

## What this adds

Ferocity now has one native acquisition path:

`tracked link / QR -> customer-sent message -> Connect conversation -> lead -> estimate -> job -> invoice/payment -> collected-revenue attribution -> conversion feedback`

This extends the existing Connect, Growth, customer, job, estimate, invoice, payment, approval, credential-vault, and AI Workforce systems. It does not create a second inbox, CRM, or bot.

## Operator flow

1. Open **Growth -> Direct to conversation**.
2. Choose the business, destination channel, source/campaign, optional ad ID, destination, fallback URL, and customer-facing prefilled message.
3. Use the generated `ferocity.live/c/{slug}` URL or download its QR image.
4. The customer clicks and explicitly sends the message. Ferocity never sends the first message merely because the link was opened.
5. A short opaque `FRC-…` token in the draft message reconnects the inbound message to the server-side click record.
6. The message enters the canonical Connect conversation. Ferocity reuses or creates the canonical lead and keeps the original attribution attached.
7. Existing Growth triggers carry the lead’s source through estimates, jobs, invoices, and collected cash.

Desktop SMS clicks use the configured web fallback when one exists and preserve the opaque token as `ferocity_attribution`. Mobile SMS uses the native `sms:` composer. WhatsApp uses its official deep-link format. Apple Messages for Business, Meta/Instagram messaging, and RCS remain provider capabilities with explicit fallbacks; Ferocity does not claim consumer iMessage support.

## Conversion feedback

The provider-neutral queue is backed by `conversion_feedback_destinations` and `conversion_feedback_deliveries`. Meta Conversions API is the first implemented adapter.

Meta setup requires:

- a dataset/pixel ID and current Graph API version in Growth;
- an encrypted vault credential with provider `facebook` and label `capi_access_token`;
- an active destination;
- approval of queued events when the destination is approval-first.

Delivery uses stable event IDs, an idempotency constraint, retries with exponential backoff, redacted request logging, and an honest error state. Email and phone are SHA-256 hashed before transmission and are excluded unless the lead has recorded contact consent. Google Ads, TikTok Ads, and Microsoft Ads should be added as adapters to this same queue rather than as parallel systems.

## Ferocity leads instead of waiting

The Ferocity chat’s first returning-user message now comes from the current Attention/Opportunity evidence and names the top action. **Take the lead** instructs Ferocity to inspect the evidence, complete safe authorized internal steps, prepare consequential actions for approval, and return only results or real owner decisions. The existing scheduled AI Growth Department continues proactive evidence scans and safe internal work without requiring the owner to invent every next prompt.

## Boundaries

- No provider is shown as active until its required credentials are configured.
- Paid spend, public publishing, reputation-sensitive replies, and other consequential actions still use approval/authority controls.
- The opaque message token is stored only as a hash; only a short preview is retained.
- IP addresses are tenant-salted and hashed.
- TikTok Shop is a separate commerce adapter lane. It should reuse canonical products, orders, customers, attribution, publishing, and fulfillment, but is not implied by the TikTok Ads or Content connections.

## Before release

Apply migration `228_direct_conversation_acquisition.sql`, set the production app URL, configure any desired conversion destination and encrypted token, then certify one mobile SMS link, one desktop fallback, one QR scan, one inbound token match, and one source-to-payment test. No frontend or production deployment was performed as part of this implementation.
