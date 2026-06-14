# LifeOps Project Map

Source:

`C:\Users\schem\Documents\Codex\2026-05-31\we-need-a-folder-that-says\outputs\project-where-things-live\README.md`

This document is the local evidence used to enrich Ferocity's LifeOps connection registry.

## Confirmed Or Mostly Confirmed

- Ferocity: `https://ferocity.live`, Netlify `ferocityflo`, Supabase `puvpgebitzvyqbdnnlyz`.
- MarketplacePro: `https://marketplacepro.live`, Netlify `marketplacepro-live-fresh`, Supabase `ruwctmxvarkhajayixcd`.
- GovFlow / BidOps: `https://bidops.net` is the primary public domain from local docs, `https://govflow.live` is a related engine/redirect domain, and `https://bidops-govflow.netlify.app` is a pilot/staging reference.
- 4Bid / 4 Bid / 4bid: use the current `https://4bidauction.com` project, Netlify `4bid-web`, Supabase `ikrwjexmwgovuympqurd`, and GitHub `cburton12345/4bid`. Do not use old Render or archived clean-copy references by default.
- GuardianSignal / Alive: use the current `https://guardiansignal.net` public brand, Netlify `carecheck-health-alerts`, Supabase `vsqesazctpwxzpktjdxu`, and repo `C:\Users\schem\Alive`. The old `alive-apk-preview` Netlify site is legacy/avoid.
- Diamond Homes contract portal: `https://diamond-homes-contracts.netlify.app`, but real production/domain status is not confirmed.

## Needs Confirmation

- Homes4Rent / H4R: likely accounts `burtonchristopher125@gmail.com` and `homes4rent125@gmail.com`.
- Preferred Trailer: likely connected to `preferredtrailer1@gmail.com`.
- TZ's Construction / Believe TZS: possible Supabase under `schema7777777`, but not confirmed.

## Connector Priority

1. MarketplacePro: strongest current overlap with Ferocity leads and vendor/provider workflows.
2. GovFlow / BidOps: deadline, procurement-decision, import-failure, compliance, and opportunity events should feed Owner Command.
3. GuardianSignal / Alive: safety alerts, missed check-ins, caregiver escalation, and notification failures should feed Owner Command, but avoid destructive changes in GuardianSignal.
4. 4Bid current: buyer/seller disputes, payments, auction close exceptions, settlement needs, and backend health can feed Owner Command.
5. Diamond Homes: contract signing/payment/proof events can feed Owner Command after production status is clarified.
6. H4R, Preferred Trailer, and TZS: keep as planned until repo/hosting/Supabase are confirmed.

## Current Vs Legacy Rules

- `GovFlow`, `BidOps`, and `Bid Ops` should route to the same LifeOps platform record: `bidops`.
- `Alive`, `GuardianSignal`, and `Guardian Signal` should route to the same LifeOps platform record: `guardiansignal`.
- `4Bid`, `4 Bid`, and `4bid` should route to the current LifeOps platform record: `4bid`.
- For 4Bid, prefer `C:\Users\schem\OneDrive\Documents\GitHub\4bid` when available. Old `4bid-clean`, `fourbid.onrender.com`, and `4bid-api.onrender.com` references are legacy unless explicitly requested.
- For GuardianSignal, prefer `C:\Users\schem\Alive` and `carecheck-health-alerts`. Old `alive-apk-preview` is legacy unless explicitly requested.

## Rule

Do not merge these products into Ferocity. Each system should publish owner-level events into Ferocity through `/api/owner-command-center/events`, while Ferocity keeps the owner dashboard, AI summary, and escalation layer.
