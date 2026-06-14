# LifeOps Project Map

Source:

`C:\Users\schem\Documents\Codex\2026-05-31\we-need-a-folder-that-says\outputs\project-where-things-live\README.md`

This document is the local evidence used to enrich Ferocity's LifeOps connection registry.

## Confirmed Or Mostly Confirmed

- Ferocity: `https://ferocity.live`, Netlify `ferocityflo`, Supabase `puvpgebitzvyqbdnnlyz`.
- MarketplacePro: `https://marketplacepro.live`, Netlify `marketplacepro-live-fresh`, Supabase `ruwctmxvarkhajayixcd`.
- 4Bid: `https://4bidauction.com`, Netlify `4bid-web`, Supabase `ikrwjexmwgovuympqurd`.
- GuardianSignal / Alive: `https://guardiansignal.net`, Netlify `carecheck-health-alerts`, Supabase `vsqesazctpwxzpktjdxu`.
- Diamond Homes contract portal: `https://diamond-homes-contracts.netlify.app`, but real production/domain status is not confirmed.

## Needs Confirmation

- Homes4Rent / H4R: likely accounts `burtonchristopher125@gmail.com` and `homes4rent125@gmail.com`.
- Preferred Trailer: likely connected to `preferredtrailer1@gmail.com`.
- TZ's Construction / Believe TZS: possible Supabase under `schema7777777`, but not confirmed.

## Connector Priority

1. MarketplacePro: strongest current overlap with Ferocity leads and vendor/provider workflows.
2. GuardianSignal: safety alerts should feed Owner Command, but avoid destructive changes in GuardianSignal.
3. 4Bid: buyer/seller disputes, payments, offers, and backend health can feed Owner Command.
4. GovFlow/BidOps: deadline and procurement-decision events should feed Owner Command.
5. Diamond Homes: contract signing/payment/proof events can feed Owner Command after production status is clarified.
6. H4R, Preferred Trailer, and TZS: keep as planned until repo/hosting/Supabase are confirmed.

## Rule

Do not merge these products into Ferocity. Each system should publish owner-level events into Ferocity through `/api/owner-command-center/events`, while Ferocity keeps the owner dashboard, AI summary, and escalation layer.
