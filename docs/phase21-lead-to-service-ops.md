# Phase 21 Lead To Service Ops

Phase 21 connects CRM intake to the field-service operating core.

## Delivered

- Lead detail pages can convert a qualified lead into a service customer.
- Conversion can optionally create an estimate draft and/or unscheduled job.
- Converted leads are marked qualified/contacted and get a timeline event.
- Customer records link back to the source lead.
- `/app/service/customers/[customerId]` shows customer profile, source lead link, estimates, jobs, and invoices.
- Customer rows in Service Ops link to the customer detail page.

## Safety

- Conversion creates internal records only.
- Estimate drafts use placeholder pricing until an operator edits real amounts.
- No customer messages are sent automatically.
- No payment, calendar, or dispatch integration is connected.
