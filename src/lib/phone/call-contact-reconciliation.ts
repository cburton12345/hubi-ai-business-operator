import { queryPostgres } from "@/lib/db/postgres";
import { normalizeVoicePhone } from "@/lib/phone/inbound-call-context";

export type VoiceDisposition =
  | "new_lead"
  | "existing_customer"
  | "scheduled"
  | "message_taken"
  | "transferred"
  | "followup_needed"
  | "spam"
  | "unresolved"
  | "failed";

export function canonicalizeVoiceDisposition(value: unknown): VoiceDisposition | null {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (["new_lead", "lead", "qualified_lead", "sales_lead"].includes(normalized)) return "new_lead";
  if (["existing_customer", "customer", "current_customer"].includes(normalized)) return "existing_customer";
  if (["scheduled", "appointment_booked", "booked", "appointment_scheduled"].includes(normalized)) return "scheduled";
  if (["message_taken", "take_message", "voicemail"].includes(normalized)) return "message_taken";
  if (["transferred", "transfer_completed", "human_handoff"].includes(normalized)) return "transferred";
  if (["followup_needed", "follow_up_needed", "callback_requested", "needs_followup"].includes(normalized)) return "followup_needed";
  if (["spam", "wrong_number", "robocall"].includes(normalized)) return "spam";
  if (["failed", "provider_failed", "call_failed"].includes(normalized)) return "failed";
  return "unresolved";
}

function safeText(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function reconcileCallContact(input: {
  tenantId: string;
  brandId: string | null;
  customerId?: string | null;
  leadId?: string | null;
  callerNumber?: string | null;
  callerName?: unknown;
  callerEmail?: unknown;
  summary?: unknown;
  outcome: VoiceDisposition | null;
  qualification: "hot" | "warm" | "cold" | "not_a_fit" | "spam" | "unknown";
  consentToContact: boolean;
  provider: string;
  providerCallId: string;
  finalEvent: boolean;
}) {
  const phoneDigits = normalizeVoicePhone(input.callerNumber);
  let customerId = input.customerId ?? null;
  let leadId = input.leadId ?? null;

  if (customerId) {
    const verified = await queryPostgres<{ id: string }>(
      "select id from public.customers where tenant_id=$1 and id=$2 limit 1",
      [input.tenantId, customerId]
    );
    if (!verified?.rows[0]) customerId = null;
  }
  if (!customerId && phoneDigits.length >= 7) {
    const matched = await queryPostgres<{ id: string }>(
      `select id from public.customers
        where tenant_id=$1 and status <> 'do_not_contact'
          and right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$2
        order by updated_at desc limit 1`,
      [input.tenantId, phoneDigits]
    );
    customerId = matched?.rows[0]?.id ?? null;
  }

  if (customerId) {
    if (input.finalEvent) {
      await queryPostgres(
        `update public.customers
            set name=coalesce(nullif($3,''),name),
                email=coalesce(nullif(lower($4),''),email),
                ai_summary=coalesce(nullif($5,''),ai_summary),
                updated_at=now()
          where tenant_id=$1 and id=$2`,
        [
          input.tenantId,
          customerId,
          safeText(input.callerName, 160) ?? "",
          safeText(input.callerEmail, 320) ?? "",
          safeText(input.summary, 1_500) ?? ""
        ]
      );
    }
    return { customerId, leadId: null, created: false, contactType: "customer" as const };
  }

  if (leadId) {
    const verified = await queryPostgres<{ id: string }>(
      "select id from public.leads where tenant_id=$1 and id=$2 limit 1",
      [input.tenantId, leadId]
    );
    if (!verified?.rows[0]) leadId = null;
  }
  if (!leadId && phoneDigits.length >= 7) {
    const matched = await queryPostgres<{ id: string }>(
      `select id from public.leads
        where tenant_id=$1 and right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$2
        order by updated_at desc limit 1`,
      [input.tenantId, phoneDigits]
    );
    leadId = matched?.rows[0]?.id ?? null;
  }

  const shouldCreate = input.finalEvent
    && Boolean(input.brandId && input.callerNumber)
    && input.outcome !== "spam"
    && input.qualification !== "spam";
  let created = false;
  if (!leadId && shouldCreate) {
    const inserted = await queryPostgres<{ id: string }>(
      `insert into public.leads (
         tenant_id,brand_id,source,source_detail,name,email,phone,message,
         lead_type,status,qualification_status,priority,consent_to_contact,metadata_json
       )
       select $1,$2,'ai_phone_receptionist',$3,$4,$5,$6,$7,
              'appointment','new',$8,$9,$10,$11::jsonb
       where not exists (
         select 1 from public.leads where tenant_id=$1 and metadata_json->>'providerCallId'=$3
       )
       returning id`,
      [
        input.tenantId,
        input.brandId,
        input.providerCallId,
        safeText(input.callerName, 160),
        safeText(input.callerEmail, 320),
        input.callerNumber,
        safeText(input.summary, 2_000),
        ["hot", "warm"].includes(input.qualification) ? "qualified" : "needs_review",
        ["hot", "warm"].includes(input.qualification) ? "high" : "normal",
        input.consentToContact,
        JSON.stringify({ provider: input.provider, providerCallId: input.providerCallId, source: "voice_ai_webhook" })
      ]
    );
    leadId = inserted?.rows[0]?.id ?? null;
    created = Boolean(leadId);
  }

  if (leadId && input.finalEvent) {
    await queryPostgres(
      `update public.leads
          set name=coalesce(nullif($3,''),name),
              email=coalesce(nullif(lower($4),''),email),
              phone=coalesce(nullif($5,''),phone),
              message=coalesce(nullif($6,''),message),
              qualification_status=case when $7 in ('hot','warm') then 'qualified' else qualification_status end,
              priority=case when $7 in ('hot','warm') then 'high' else priority end,
              consent_to_contact=consent_to_contact or $8,
              metadata_json=metadata_json || $9::jsonb,
              updated_at=now()
        where tenant_id=$1 and id=$2`,
      [
        input.tenantId,
        leadId,
        safeText(input.callerName, 160) ?? "",
        safeText(input.callerEmail, 320) ?? "",
        input.callerNumber ?? "",
        safeText(input.summary, 2_000) ?? "",
        input.qualification,
        input.consentToContact,
        JSON.stringify({ lastVoiceCallId: input.providerCallId, lastVoiceOutcome: input.outcome })
      ]
    );
  }
  return { customerId: null, leadId, created, contactType: leadId ? "lead" as const : "unknown" as const };
}
