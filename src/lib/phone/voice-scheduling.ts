import { withPostgresTransaction } from "@/lib/db/postgres";

export type VoiceAppointmentResult = {
  ok: boolean;
  appointmentId: string | null;
  status: "booked" | "requested" | "invalid";
  reason: string;
};

export async function createVoiceAppointment(input: {
  tenantId: string;
  brandId: string | null;
  leadId: string | null;
  customerId: string | null;
  providerCallId: string;
  startsAt: string;
  durationMinutes?: number;
  confirmedBySignedTool?: boolean;
  service?: string | null;
}): Promise<VoiceAppointmentResult> {
  const start = new Date(input.startsAt);
  const duration = Math.max(15, Math.min(240, Math.round(input.durationMinutes ?? 60)));
  if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now() + 5 * 60_000) {
    return { ok: false, appointmentId: null, status: "invalid", reason: "The requested time is invalid or already passed." };
  }
  const end = new Date(start.getTime() + duration * 60_000);
  const result = await withPostgresTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`voice-schedule:${input.tenantId}`]);
    const existing = await client.query<{ id: string; status: string }>(
      `select id,status from public.revenue_appointments
       where tenant_id=$1 and metadata_json->>'providerCallId'=$2 limit 1`,
      [input.tenantId, input.providerCallId]
    );
    if (existing.rows[0]) return { id: existing.rows[0].id, status: existing.rows[0].status, conflict: false };
    const conflicts = await client.query<{ conflict_count: string }>(
      `select (
         (select count(*) from public.revenue_appointments
          where tenant_id=$1 and status in ('booked','confirmed','rescheduled')
            and scheduled_start < $3 and scheduled_end > $2)
         +
         (select count(*) from public.service_visits
          where tenant_id=$1 and status not in ('completed','canceled','no_show')
            and scheduled_start < $3 and scheduled_end > $2)
       )::text as conflict_count`,
      [input.tenantId, start.toISOString(), end.toISOString()]
    );
    const conflict = Number(conflicts.rows[0]?.conflict_count ?? 0) > 0;
    const mayBook = input.confirmedBySignedTool === true && !conflict;
    const inserted = await client.query<{ id: string; status: string }>(
      `insert into public.revenue_appointments (
         tenant_id,brand_id,lead_id,customer_id,appointment_type,status,scheduled_start,
         scheduled_end,booking_source,show_sequence_key,metadata_json
       ) values ($1,$2,$3,$4,'estimate',$5,$6,$7,'ai_phone_receptionist',
         'qualified_appointment_show_rate',$8::jsonb) returning id,status`,
      [input.tenantId, input.brandId, input.leadId, input.customerId, mayBook ? "booked" : "requested",
        start.toISOString(), end.toISOString(), JSON.stringify({
          providerCallId: input.providerCallId,
          requiresAvailabilityConfirmation: !mayBook,
          availabilityConflictDetected: conflict,
          confirmedBySignedTool: input.confirmedBySignedTool === true,
          service: input.service ?? null
        })]
    );
    return { id: inserted.rows[0]?.id ?? null, status: inserted.rows[0]?.status ?? "requested", conflict };
  });
  if (!result?.id) return { ok: false, appointmentId: null, status: "invalid", reason: "The appointment could not be saved." };
  const booked = result.status === "booked";
  return {
    ok: true,
    appointmentId: result.id,
    status: booked ? "booked" : "requested",
    reason: booked ? "The time was available and is booked." : result.conflict
      ? "That time conflicts with the schedule, so Ferocity created a request for review."
      : "Ferocity saved the requested time for confirmation."
  };
}
