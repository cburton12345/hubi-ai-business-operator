# Ferocity incident response and customer status

Status: local implementation complete; production activation waits for the final deployment.

## Customer experience

- A page-level failure shows a clear retry action instead of raw framework output.
- A root application failure shows the same calm recovery direction without needing the normal layout.
- `/status` explains recovery behavior without querying customer data.
- `/emergency.html` is a plain static CDN asset with no database, authentication, provider, or JavaScript dependency.

## First response

1. Confirm impact with `/health` and an external synthetic probe.
2. Pause the affected provider or autonomous action lane; do not disable unrelated services.
3. Preserve logs, request IDs, provider event IDs, and deployment identifiers.
4. Determine whether payments, messages, or jobs may have been submitted before advising customers to retry.
5. Post a short factual update. Do not claim that data is safe until database and backup status are verified.
6. Update customers at least every 30 minutes during a material incident, even if diagnosis is still underway.
7. Verify idempotency and reconcile provider state before restoring queued actions.

## Customer update templates

Initial: `Ferocity is experiencing an interruption affecting [feature]. We are investigating now. Please avoid repeatedly submitting [payments/messages/actions]. The next update will be posted by [time].`

Identified: `We identified the cause of the [feature] interruption and are applying a recovery step. Other Ferocity services remain [available/affected]. The next update will be posted by [time].`

Recovered: `Ferocity service has been restored. We are monitoring recovery and reconciling any queued or uncertain actions before they resume. We will publish a final summary after verification.`

## Remaining external requirement

The static emergency page survives application, database, and provider failures on Netlify. It cannot survive a complete Netlify or DNS outage. Before broad launch, configure a separately hosted status service on a different provider/domain and an external uptime monitor that can publish incidents without depending on Ferocity.
