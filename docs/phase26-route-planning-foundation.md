# Phase 26: Route Planning Foundation

Phase 26 adds a dispatcher route planning view for service businesses.

## What changed

- Added `/app/service/routes`.
- Groups scheduled and in-progress jobs over the next 14 days.
- Shows route stop order, job, customer, assigned team member, service area, service address, status, and dispatcher notes.
- Added a route planning entry point from the service command center.

## Product intent

This gives external service businesses a practical daily operations view before adding map, calendar, GPS, or technician mobile integrations.

## Safety

- No map API is connected.
- No customer messages are sent.
- No schedule changes are made automatically.
