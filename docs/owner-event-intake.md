# Ferocity Owner Event Intake

Ferocity can receive owner-operations events from other platforms without merging codebases.

## Endpoint

Production:

```text
POST https://ferocity.live/api/owner-command-center/events
```

Local:

```text
POST http://localhost:3017/api/owner-command-center/events
```

## Required Sender Env Vars

```env
FEROCITY_OWNER_EVENTS_URL=https://ferocity.live/api/owner-command-center/events
FEROCITY_OWNER_EVENTS_TOKEN=<Ferocity OWNER_COMMAND_CENTER_TOKEN>
FEROCITY_TENANT_ID=11111111-1111-4111-8111-111111111111
```

## Auth

Send the token as a bearer token:

```http
Authorization: Bearer <FEROCITY_OWNER_EVENTS_TOKEN>
Content-Type: application/json
```

The endpoint also accepts:

```http
x-ferocity-owner-event-token: <FEROCITY_OWNER_EVENTS_TOKEN>
```

## Payload

```json
{
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "platformKey": "4bid",
  "platformName": "4Bid",
  "externalEventId": "unique-source-event-id",
  "eventType": "payment.issue",
  "title": "Payment issue needs review",
  "summary": "A buyer payment needs owner attention.",
  "severity": "high",
  "status": "needs_owner",
  "ownerAttention": true,
  "aiHandled": false,
  "aiSummary": "Optional short AI/operator summary.",
  "recommendedAction": "Open the source system and verify the issue.",
  "actionHref": "/app/owner-command-center",
  "moneyCents": 12500,
  "riskType": "financial",
  "confidenceScore": 92,
  "metadata": {
    "source": "4bid"
  }
}
```

## Allowed Values

`severity`: `info`, `low`, `medium`, `high`, `critical`

`status`: `open`, `needs_owner`, `critical`, `ai_handled`, `watching`, `resolved`, `archived`

`riskType`: `revenue`, `financial`, `customer`, `legal`, `safety`, `automation`, `low_confidence`, `approval`

## Registered Platform Examples

- `4bid` / `4Bid`
- `marketplacepro` / `MarketplacePro`
- `guardiansignal` / `GuardianSignal`
- `bidops` / `BidOps / GovFlow`
- `h4r` / `Homes4Rent`
- `preferred-trailer` / `Preferred Trailer`
- `diamond-homes` / `Diamond Homes`
- `tz-construction` / `TZ's Construction`

New systems can be registered in Ferocity at `/app/lifeops-connections`, labeled **Connected Systems** in the app.

## Smoke Tests

```bash
npm run owner:smoke:4bid
npm run owner:smoke:marketplacepro
npm run owner:smoke:guardiansignal
npm run owner:smoke:bidops
```

Keep a test event in the Owner Command Center:

```bash
KEEP_OWNER_TEST_EVENT=1 npm run owner:smoke:4bid
```

## Rule

Only send owner-worthy events: money, risk, dispute, deadline, safety/legal concern, customer escalation, platform failure, low confidence, or owner approval needed.
