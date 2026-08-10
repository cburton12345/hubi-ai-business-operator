# Connected Systems Event Senders

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

Owner-facing destination:

- Important events appear in **Owner Command**.
- High-signal items also roll into **Daily Brief**.
- Immediate notifications are reserved for money, risk, customer trouble, safety, payroll, failed automation, urgent bid opportunities, low confidence, or owner approval.

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
- Homes4Rent: `C:\Users\schem\OneDrive\Desktop\homes4rent-supabase-functions-2026-07-19\supabase\functions\ferocity-owner-alert-bridge\index.ts`

## Current Status

The sender stubs exist locally. Homes4Rent now has a read-only, idempotent bridge from its existing `leasing_owner_alerts` table. The bridge is not deployed or scheduled yet. It skips safely when connection secrets are absent and never changes Homes4Rent alert, rent, payment, or messaging records.

Next wiring points:

- MarketplacePro: call sender after important `posts`, `offers`, `worker_contact_requests`, `support_requests`, and provider-save events.
- GovFlow / BidOps: call sender when strong-fit opportunities, deadline risks, import failures, compliance issues, or go/no-go decisions happen.
- GuardianSignal / Alive: call sender on safety alerts, missed check-ins, caregiver escalation, device token failures, and health sync failures.
- 4Bid: call sender on payment issues, auction close exceptions, buyer/seller disputes, settlement needs, and backend health issues.
- Homes4Rent: deploy and schedule `ferocity-owner-alert-bridge`, configure its four secrets, then certify one dry run and one live owner-alert delivery. Keep write-back commands out of this first connection.
