# Phase 57: Lead-To-Job Operator Loop

This phase adds the next vertical platform slice without scattering features across the app.

## What changed

- Added communication thread/message/template tables for SMS, email, phone, web, manual, and internal workflows.
- Added opportunity pipeline stages, opportunities, and stage movement audit events.
- Added operator schedule events for callbacks, appointments, scheduled jobs, reminders, Google Calendar readiness, and future dispatch optimization.
- Added `/app/operator` as one focused operator surface for conversations, pipeline, schedule, templates, and operational timeline.
- Added a scan action that creates records only from real leads and jobs:
  - communication threads for open leads
  - draft customer-visible response messages
  - opportunity records for open/qualified leads
  - callback events for follow-up needs
  - schedule events for existing scheduled jobs
- Added stage movement, conversation status, internal note, and schedule status actions with timeline events.

## Product posture

This is not a fake two-way inbox or fake dispatcher. Provider sends remain disabled until Twilio, email, calendar, and dispatch provider credentials/webhooks are configured.

The intent is a reliable operating vertical:

1. Capture a lead.
2. Start a conversation record.
3. Track opportunity stage and follow-up.
4. Schedule callbacks, appointments, and jobs.
5. Record events into the unified operator timeline.
6. Preserve a clean path for provider integrations and automation quality.
