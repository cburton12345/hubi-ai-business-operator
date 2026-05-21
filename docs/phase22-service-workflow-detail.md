# Phase 22 Service Workflow Detail

Phase 22 turns the field-service records into daily workflow screens.

## Delivered

- Estimate detail pages with line items, status workflow, internal notes, and manual follow-up draft editing.
- Job detail pages with status workflow, schedule fields, dispatcher notes, completion notes, and next-action editing.
- Invoice detail pages with line items, status workflow, amount-paid tracking, due date, internal notes, and manual payment notes.
- Service Ops and customer profiles now link into estimate, job, and invoice detail records.

## Safety

- Updating an estimate to `sent_manually` is only a tracking status; the app does not send it.
- Invoice updates do not charge cards or create payment requests.
- Job scheduling is internal only and does not sync to external calendars.
