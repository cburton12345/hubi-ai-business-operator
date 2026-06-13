# Owner Command Center Intake

Slashboard is now the prototype and specification for Ferocity's Owner Command Center. Connected systems should publish important owner-level events into Ferocity instead of becoming separate dashboards.

## Endpoint

`POST /api/owner-command-center/events`

Send either:

- `Authorization: Bearer <OWNER_COMMAND_CENTER_TOKEN>`
- `x-ferocity-owner-event-token: <OWNER_COMMAND_CENTER_TOKEN>`

The endpoint is safe by default. It records an event; it does not send messages, publish content, spend money, change ads, or mutate outside systems.

## Payload Example

```json
{
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "platformKey": "govflow",
  "platformName": "GovFlow",
  "externalEventId": "govflow-opportunity-123",
  "eventType": "deadline.contract",
  "title": "Government opportunity deadline approaching",
  "summary": "A matching opportunity needs a go/no-go decision before the response window closes.",
  "severity": "critical",
  "status": "needs_owner",
  "ownerAttention": true,
  "aiHandled": false,
  "aiSummary": "AI can summarize fit and missing documents, but owner decision is required.",
  "recommendedAction": "Review bid fit, timeline, and documents before committing.",
  "actionHref": "/app/operator-depth",
  "moneyCents": 0,
  "riskType": "legal",
  "confidenceScore": 74,
  "metadata": {
    "sourceUrl": "https://example.com/opportunity/123"
  }
}
```

## Escalation Rule

Only escalate to the owner for revenue opportunity, financial risk, customer dispute, legal issue, safety issue, automation failure, low confidence, or human approval required.

## Ferocity Timeline Bridge

Ferocity can also promote important local `operator_timeline_events` into the Owner Command Center.

Use the app button:

`Owner Command Center -> Sync Ferocity Activity`

That action scans recent Ferocity timeline events and promotes owner-visible activity such as:

- high-value leads
- estimate or invoice money risk
- billing or automation failures
- review/reputation items
- AI-prepared work that should be reviewed

This is intentionally a bridge, not a duplicate workflow system. The source record stays in the existing Ferocity module, and the owner event points back to the relevant area.
