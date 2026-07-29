"use server";

import { redirect } from "next/navigation";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { queryPostgres } from "@/lib/db/postgres";
import { evaluateLeadSubmission } from "@/lib/leads/spam-guard";

export async function requestPublicAppointment(formData: FormData) {
  const publicKey = String(formData.get("formPublicKey") ?? "");
  const requestedStart = new Date(String(formData.get("requestedStart") ?? ""));
  const now = Date.now();
  if (
    !publicKey ||
    !Number.isFinite(requestedStart.getTime()) ||
    requestedStart.getTime() < now + 30 * 60 * 1000 ||
    requestedStart.getTime() > now + 366 * 24 * 60 * 60 * 1000 ||
    String(formData.get("website") ?? "")
  ) {
    redirect(`/book/${encodeURIComponent(publicKey)}?error=1`);
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const consent = formData.get("consentToContact") === "on";
  if (!email && !phone) redirect(`/book/${encodeURIComponent(publicKey)}?error=1`);
  const leadInput = {
    formPublicKey: publicKey,
    source: "public_booking",
    sourceDetail: "ferocity_public_appointment",
    name: name || undefined,
    email: email || undefined,
    phone: phone || undefined,
    message: message || undefined,
    leadType: "appointment",
    consentToContact: consent,
    utm: {},
    details: {
      serviceInterest: service || undefined,
      requestedAppointmentStart: requestedStart.toISOString()
    }
  } as const;
  if (!evaluateLeadSubmission(leadInput, {}).ok) {
    redirect(`/book/${encodeURIComponent(publicKey)}?error=1`);
  }
  const lead = await createPublicLead(leadInput, {});
  if (!lead.ok) redirect(`/book/${encodeURIComponent(publicKey)}?error=1`);

  const leadRow = await queryPostgres<{ tenant_id: string; brand_id: string | null }>(
    `select tenant_id, brand_id from public.leads where id = $1 limit 1`,
    [lead.leadId]
  );
  const row = leadRow?.rows[0];
  if (!row) redirect(`/book/${encodeURIComponent(publicKey)}?error=1`);

  await queryPostgres(
    `
    insert into public.revenue_appointments (
      tenant_id, brand_id, lead_id, appointment_type, status, scheduled_start,
      scheduled_end, booking_source, show_sequence_key, metadata_json
    )
    values ($1,$2,$3,'estimate','requested',$4,$5,'public_booking',
      'qualified_appointment_show_rate',$6::jsonb)
    `,
    [
      row.tenant_id,
      row.brand_id,
      lead.leadId,
      requestedStart.toISOString(),
      new Date(requestedStart.getTime() + 60 * 60 * 1000).toISOString(),
      JSON.stringify({
        requestedByCustomer: true,
        requiresAvailabilityConfirmation: true,
        service,
        message
      })
    ]
  );
  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, recommended_action, action_href,
      risk_type, confidence_score, metadata_json
    )
    values ($1,'ferocity','Ferocity',$2,'appointment.requested','Customer requested an appointment',
      $3,'high','needs_owner',true,false,'Confirm availability or offer another time.',
      '/app/revenue-growth#appointments','customer',95,$4::jsonb)
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing
    `,
    [
      row.tenant_id,
      `public-appointment:${lead.leadId}`,
      `${name || "A customer"} requested ${requestedStart.toLocaleString("en-US")} for ${service || "an appointment"}.`,
      JSON.stringify({ leadId: lead.leadId, requestedStart: requestedStart.toISOString(), service })
    ]
  );
  redirect(`/book/${encodeURIComponent(publicKey)}?success=1`);
}
