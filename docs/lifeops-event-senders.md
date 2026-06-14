# LifeOps Event Senders

Ferocity Owner Command receives owner-level events at:

`/api/owner-command-center/events`

External systems should send only high-signal events:

- money opportunity
- financial risk
- customer dispute
- legal issue
- safety issue
- automation failure
- low confidence decision
- human approval required

## Shared Environment Contract

Every external sender uses the same environment names:

- `FEROCITY_OWNER_EVENTS_URL`: usually `https://ferocity.live/api/owner-command-center/events`.
- `FEROCITY_OWNER_EVENTS_TOKEN`: bearer token matching Ferocity `OWNER_COMMAND_CENTER_TOKEN`.
- `FEROCITY_TENANT_ID`: optional Ferocity tenant/workspace id.

If these values are missing, sender stubs skip cleanly and do not break the host product.

## Sender Locations

- MarketplacePro: `C:\Users\schem\Documents\Codex\2026-05-25\marketplacepro-live-is-a-site-chatgpt\netlify-deploy-latest\netlify\functions\_shared\ferocity-owner-events.js`
- GovFlow / BidOps: `C:\Users\schem\Documents\Codex\2026-05-26\build-an-mvp-government-contract-opportunity\src\ferocity\index.js`
- GuardianSignal / Alive: `C:\Users\schem\Alive\supabase\functions\_shared\ferocity-owner-events.ts`
- 4Bid current: `C:\Users\schem\OneDrive\Documents\GitHub\4bid\apps\api\src\common\ferocity-owner-events.service.ts`

## Current Status

The sender stubs exist locally. They are not deployed. They are not automatically wired into every business workflow yet.

Next wiring points:

- MarketplacePro: call sender after important `posts`, `offers`, `worker_contact_requests`, `support_requests`, and provider-save events.
- GovFlow / BidOps: call sender when strong-fit opportunities, deadline risks, import failures, compliance issues, or go/no-go decisions happen.
- GuardianSignal / Alive: call sender on safety alerts, missed check-ins, caregiver escalation, device token failures, and health sync failures.
- 4Bid: call sender on payment issues, auction close exceptions, buyer/seller disputes, settlement needs, and backend health issues.
