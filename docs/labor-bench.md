# Labor Bench

Labor Bench is Ferocity's owner-approved staffing layer. It helps a business record worker needs, collect worker or subcontractor availability, generate match suggestions, and track the outcome without turning Ferocity into an uncontrolled staffing agency.

## Owner Flow

1. Owner opens `/app/labor-bench`.
2. Owner creates a worker request with trade, area, timing, headcount, pay range, urgency, and notes.
3. Workers are added manually, imported later from MarketplacePro, or submitted through `/workers/[publicKey]`.
4. Ferocity suggests matches using trade, area, availability, consent, urgency, and request details.
5. Owner approves contact before anyone is contacted or placed.
6. Ferocity records request, worker, match, and status events in Owner Command Center.

## Public Worker Intake

The public worker intake route reuses an active workspace public form key:

`/workers/[publicKey]`

This keeps public-worker intake tied to an existing tenant and brand without creating a second public identity system. The form captures source, campaign, referrer, page URL, worker contact information, availability, rate, experience, and consent to contact.

## Safety Rules

- No automatic hiring.
- No automatic worker contact.
- No worker placement without owner approval.
- Worker intake is tracked as availability, not employment verification.
- MarketplacePro labor imports should land as worker availability or labor events, then Ferocity handles follow-up and owner approval.

## Tier Behavior

Labor Bench is gated through the existing feature-entitlement system:

- `labor_staffing_requests`
- `labor_worker_intake`
- `labor_match_suggestions`

The billing dashboard and system health page show usage. Admin accounts can bypass normal limits through existing admin/workspace controls.

## QA

Run:

```bash
npm run labor:smoke
```

This verifies:

- Owner Command Center accepts Labor Bench events.
- Public worker intake records can be inserted and cleaned up.

Launch smoke and route crawl also discover an active worker intake URL and crawl it when a public form key exists.
