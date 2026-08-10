"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { discoverProviderCalendars, runInboundCalendarSync, runOutboundCalendarSync } from "@/lib/integrations/calendar/sync";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const providerSchema = z.enum(["google_calendar", "microsoft_calendar"]);
const settingsSchema = z.object({
  providerKey: providerSchema, calendarId: z.string().min(1).max(500),
  syncDirection: z.enum(["inbound", "outbound", "two_way"]), conflictPolicy: z.enum(["review", "ferocity_wins", "provider_wins"]),
  outboundWritesEnabled: z.boolean()
});

export async function refreshCalendarChoicesAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerSchema.safeParse(formData.get("providerKey"));
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const calendars = await discoverProviderCalendars(tenantId, parsed.data);
  await queryPostgres(
    `update public.integration_connections set metadata_json=metadata_json || $3::jsonb,last_checked_at=now(),updated_at=now()
     where tenant_id=$1 and provider=$2 and status='connected'`,
    [tenantId, parsed.data, JSON.stringify({ calendarChoices: calendars, calendarChoicesRefreshedAt: new Date().toISOString() })]
  );
  revalidatePath("/app/integrations/calendar");
}

export async function saveCalendarSettingsAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = settingsSchema.safeParse({
    providerKey: formData.get("providerKey"), calendarId: formData.get("calendarId"),
    syncDirection: formData.get("syncDirection"), conflictPolicy: formData.get("conflictPolicy"), outboundWritesEnabled: formData.get("outboundWritesEnabled") === "true"
  });
  if (!parsed.success) redirect("/app/integrations/calendar?setup=invalid");
  const tenantId = await getCurrentWorkspaceId();
  const connection = await queryPostgres<{ id: string; metadata_json: { calendarChoices?: Array<{ id: string; name: string }> } | null }>(
    "select id,metadata_json from public.integration_connections where tenant_id=$1 and provider=$2 and status='connected' limit 1",
    [tenantId, parsed.data.providerKey]
  );
  const connectionId = connection?.rows[0]?.id;
  if (!connectionId) redirect("/app/integrations/calendar?setup=connect_first");
  const selectedCalendar = connection?.rows[0]?.metadata_json?.calendarChoices?.find((choice) => choice.id === parsed.data.calendarId);
  if (!selectedCalendar) redirect("/app/integrations/calendar?setup=refresh_calendars");
  const outbound = parsed.data.outboundWritesEnabled && parsed.data.syncDirection !== "inbound";
  await queryPostgres(
    `insert into public.calendar_sync_settings (tenant_id,connection_id,provider_key,external_calendar_id,external_calendar_name,sync_direction,conflict_policy,import_external_events,outbound_writes_enabled,status,metadata_json)
     values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10::jsonb)
     on conflict (connection_id) do update set external_calendar_id=excluded.external_calendar_id,external_calendar_name=excluded.external_calendar_name,
       sync_direction=excluded.sync_direction,conflict_policy=excluded.conflict_policy,outbound_writes_enabled=excluded.outbound_writes_enabled,
       status=excluded.status,metadata_json=public.calendar_sync_settings.metadata_json || excluded.metadata_json,updated_at=now()`,
    [tenantId, connectionId, parsed.data.providerKey, parsed.data.calendarId, selectedCalendar.name, parsed.data.syncDirection, parsed.data.conflictPolicy, outbound, outbound ? "ready" : "ready_read_only", JSON.stringify({ writesRequireSeparateAuthorization: true, configuredAt: new Date().toISOString() })]
  );
  revalidatePath("/app/integrations/calendar");
}

export async function runCalendarSyncAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerSchema.safeParse(formData.get("providerKey"));
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const result = await runInboundCalendarSync({ tenantId, providerKey: parsed.data });
  const outbound = await runOutboundCalendarSync({ tenantId, providerKey: parsed.data });
  revalidatePath("/app/integrations/calendar");
  redirect(`/app/integrations/calendar?synced=${result.imported}&written=${outbound.written}&conflicts=${result.conflicts}${result.resetRequired ? "&reset=1" : ""}`);
}
