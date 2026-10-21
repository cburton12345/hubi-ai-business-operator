import { queryPostgres } from "@/lib/db/postgres";
import { runInboundCalendarSync, runOutboundCalendarSync } from "./sync";
import type { CalendarProviderKey } from "./types";

type DueCalendar = {
  tenant_id: string;
  provider_key: CalendarProviderKey;
};

export async function syncDueCalendars(input: { limit?: number; concurrency?: number } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const concurrency = Math.min(Math.max(input.concurrency ?? 2, 1), 4);
  const due = await queryPostgres<DueCalendar>(
    `select settings.tenant_id,settings.provider_key
     from public.calendar_sync_settings settings
     join public.integration_connections connection
       on connection.id=settings.connection_id
       and connection.tenant_id=settings.tenant_id
       and connection.status='connected'
     left join public.integration_sync_cursors cursor
       on cursor.connection_id=settings.connection_id
       and cursor.resource_type='calendar_events'
       and cursor.external_scope=settings.external_calendar_id
     where settings.status in ('ready','ready_read_only')
       and settings.external_calendar_id is not null
       and (
         cursor.last_completed_at is null
         or cursor.last_completed_at<now()-interval '10 minutes'
         or cursor.status in ('error','reset_required')
       )
     order by cursor.last_completed_at nulls first,settings.updated_at
     limit $1`,
    [limit],
  );
  const rows = due?.rows ?? [];
  const failures: Array<{
    tenantId: string;
    provider: CalendarProviderKey;
    message: string;
  }> = [];
  const results: Array<{
    tenantId: string;
    provider: CalendarProviderKey;
    imported: number;
    cancelled: number;
    conflicts: number;
    written: number;
    deleted: number;
    skipped: number;
  }> = [];
  let nextIndex = 0;

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex++];
      if (!row) return;
      try {
        const inbound = await runInboundCalendarSync({
          tenantId: row.tenant_id,
          providerKey: row.provider_key,
        });
        const outbound = await runOutboundCalendarSync({
          tenantId: row.tenant_id,
          providerKey: row.provider_key,
        });
        results.push({
          tenantId: row.tenant_id,
          provider: row.provider_key,
          imported: inbound.imported,
          cancelled: inbound.cancelled,
          conflicts: inbound.conflicts,
          written: outbound.written,
          deleted: outbound.deleted,
          skipped: outbound.skipped,
        });
      } catch (error) {
        failures.push({
          tenantId: row.tenant_id,
          provider: row.provider_key,
          message: error instanceof Error ? error.message : "Calendar synchronization failed.",
        });
      }
    }
  }));

  return { checked: rows.length, synced: results.length, results, failures };
}
