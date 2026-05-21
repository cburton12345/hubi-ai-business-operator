# Phase 48 Webhook Framework Auth

Phase 48 turns the webhook placeholder into a usable authenticated inbound framework while keeping outbound delivery disabled.

## What Changed

- Added inbound/outbound endpoint direction, inbound token hash storage, and last received timestamp.
- Webhook endpoints can now be activated, paused, or disabled.
- New inbound endpoint creation generates a one-time bearer token.
- Added `POST /api/webhooks/[endpointId]` for token-authenticated JSON ingestion.
- Inbound payloads are stored as `webhook_events` for manual review or later processing.

## Guardrails

- Tokens are stored hashed; the raw token is only shown once.
- Endpoints start paused.
- Inbound webhooks log events only.
- No outbound webhook delivery worker, third-party API action, publishing, messaging, billing, or ad-budget change was added.
