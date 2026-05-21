# Phase 29: Inventory And Equipment Tracking

Phase 29 adds manual inventory and equipment tracking for service businesses.

## What changed

- Added `service_inventory_items` with workspace-scoped RLS.
- Added `/app/service/inventory`.
- Tracks parts, materials, equipment, tools, vehicles, and other items.
- Shows quantity, reorder threshold, location, assigned job placeholder, status, and notes.
- Adds inventory entry point from the service command center.

## Product intent

This rounds out the Housecall Pro-style operating core with basic materials and equipment visibility while keeping the system simple enough for external businesses to use.

## Safety

- No procurement integrations.
- No accounting sync.
- No automatic purchase orders.
- No technician GPS or scanner integration yet.
