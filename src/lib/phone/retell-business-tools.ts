import { queryPostgres } from "@/lib/db/postgres";
import { reconcileCallContact } from "@/lib/phone/call-contact-reconciliation";
import { createVoiceAppointment } from "@/lib/phone/voice-scheduling";
import { resolveRetellConfiguration, resolveRetellWebhookTenant } from "@/lib/providers/retell-config";
import { verifyRetellSignature } from "@/lib/providers/voice-adapters";
import { createSupportIssue } from "@/lib/support/create-support-issue";
import { supportGuidanceFor } from "@/lib/support/self-service";

type Json = Record<string, unknown>;
function record(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown, max = 500) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function uuid(value: unknown) { const v = text(value, 36); return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null; }
function phoneFromCall(call: Json) { return text(call.from_number ?? call.to_number, 40); }

export async function processRetellBusinessTool(rawBody: string, signature: string | null) {
  let payload: Json;
  try { payload = JSON.parse(rawBody || "{}") as Json; } catch { return { ok: false, message: "The request was invalid." }; }
  const call = record(payload.call);
  const args = record(payload.args);
  const metadata = record(call.metadata);
  const name = text(payload.name, 80);
  const providerCallId = text(call.call_id, 200);
  const tenantId = await resolveRetellWebhookTenant(text(call.agent_id, 200), text(call.to_number ?? call.from_number, 40));
  if (!tenantId || !providerCallId || !name) return { ok: false, message: "Ferocity could not connect this action to a workspace." };
  const apiKey = (await resolveRetellConfiguration(tenantId, false))?.apiKey;
  if (!apiKey || !verifyRetellSignature(rawBody, apiKey, signature)) return { ok: false, message: "Ferocity could not authenticate this action." };
  const brandResult = await queryPostgres<{ id: string }>(
    `select id from public.brands where tenant_id=$1 and status='active'
     and ($2::uuid is null or id=$2::uuid) order by case when id=$2::uuid then 0 else 1 end,created_at limit 1`,
    [tenantId, uuid(metadata.ferocityBrandId ?? metadata.brandId)]
  );
  const brandId = brandResult?.rows[0]?.id ?? null;
  const callerNumber = text(args.phone, 40) ?? phoneFromCall(call);
  if (name === "diagnose_ferocity_support") {
    const description = text(args.description, 3000);
    if (!description) return { ok: false, status: "guidance_unavailable", message: "Ask the caller to describe what is not working before troubleshooting." };
    const guidance = supportGuidanceFor({ issueType: text(args.issue_type, 80), description });
    const saved = await queryPostgres<{ id: string }>(
      `insert into public.support_self_service_events (
         tenant_id,provider_key,provider_call_id,issue_type,problem_summary,guidance_key,outcome,escalation_required,metadata_json
       ) values ($1,'retell_voice',$2,$3,$4,$5,$6,$7,$8::jsonb)
       on conflict (provider_key,provider_call_id,guidance_key) do update set
         problem_summary=excluded.problem_summary,escalation_required=excluded.escalation_required,updated_at=now()
       returning id`,
      [
        tenantId, providerCallId, text(args.issue_type, 80) ?? "other", description, guidance.key,
        guidance.escalationRequired ? "escalation_required" : "guidance_offered", guidance.escalationRequired,
        JSON.stringify({ source: "signed_retell_tool" })
      ]
    );
    return {
      ok: true,
      status: guidance.escalationRequired ? "escalation_required" : "guidance_ready",
      self_service_id: saved?.rows[0]?.id ?? null,
      title: guidance.title,
      steps: guidance.steps,
      safety_note: guidance.safetyNote,
      message: guidance.escalationRequired
        ? "Explain that this needs protected review, then create a tracked support case."
        : "Walk through these steps, then ask whether the problem is solved and record the outcome."
    };
  }
  if (name === "record_ferocity_support_resolution") {
    const selfServiceId = uuid(args.self_service_id);
    const outcome = text(args.outcome, 20);
    if (!selfServiceId || !["solved", "not_solved"].includes(outcome ?? "")) {
      return { ok: false, status: "not_recorded", message: "The support resolution could not be matched to this call." };
    }
    const updated = await queryPostgres<{ id: string }>(
      `update public.support_self_service_events set outcome=$4,resolution_notes=$5,
         resolved_at=case when $4='solved' then now() else resolved_at end,updated_at=now()
       where id=$1 and tenant_id=$2 and provider_call_id=$3 returning id`,
      [selfServiceId, tenantId, providerCallId, outcome, text(args.notes, 1000)]
    );
    return {
      ok: Boolean(updated?.rows[0]),
      status: outcome,
      message: outcome === "solved"
        ? "Confirm the problem is solved. No administrator case is needed."
        : "The problem remains unresolved. Create a tracked support case now."
    };
  }
  if (name === "report_ferocity_support_issue") {
    const requesterEmail = text(args.email, 320)?.toLowerCase() ?? null;
    const subject = text(args.subject, 180);
    const message = text(args.message, 5000);
    if (!subject || !message) return { ok: false, status: "not_created", message: "Collect a short subject and a clear description of the problem before confirming a support case." };
    const requesterWorkspace = requesterEmail ? await queryPostgres<{ tenant_id: string }>(
      `select tu.tenant_id from public.users u join public.tenant_users tu on tu.user_id=u.id and tu.status='active'
       where lower(u.email)=lower($1) order by case tu.role when 'owner' then 0 when 'admin' then 1 else 2 end limit 1`,
      [requesterEmail]
    ) : null;
    const support = await createSupportIssue({
      tenantId: requesterWorkspace?.rows[0]?.tenant_id ?? null,
      source: "voice_agent",
      issueType: text(args.issue_type, 80) ?? "other",
      requesterName: text(args.caller_name, 160),
      requesterEmail,
      requesterPhone: callerNumber,
      severity: text(args.urgency, 20) === "high" ? "high" : "normal",
      subject,
      message,
      metadata: {
        provider: "retell_voice",
        providerCallId,
        intakeAgentTenantId: tenantId,
        callerIdentityVerified: false,
        matchedWorkspaceByEmail: Boolean(requesterWorkspace?.rows[0]),
        selfServiceId: uuid(args.self_service_id)
      }
    });
    const selfServiceId = uuid(args.self_service_id);
    if (selfServiceId) {
      await queryPostgres(
        `update public.support_self_service_events set outcome='not_solved',updated_at=now(),
           metadata_json=metadata_json || $4::jsonb where id=$1 and provider_call_id=$2 and tenant_id=$3`,
        [selfServiceId, providerCallId, tenantId, JSON.stringify({ supportIssueId: support.issueId })]
      );
    }
    return {
      ok: true,
      status: "support_case_created",
      request_id: support.issueId,
      message: `The Ferocity support case is recorded. Give the caller reference ${support.issueId}. Do not promise an exact response time.`
    };
  }
  const contact = await reconcileCallContact({
    tenantId, brandId, customerId: uuid(metadata.customerId), leadId: uuid(metadata.leadId), callerNumber,
    callerName: args.caller_name, callerEmail: args.email, summary: args.reason ?? "Updated during a phone conversation.",
    outcome: "new_lead", qualification: text(args.qualification, 20) === "hot" ? "hot" : "unknown",
    consentToContact: args.consent_to_contact === true, provider: "retell_voice", providerCallId, finalEvent: true
  });
  if (name === "update_contact") {
    return { ok: true, status: "contact_saved", customer_id: contact.customerId, lead_id: contact.leadId, message: "The contact details are saved in Ferocity." };
  }
  if (name === "book_appointment") {
    const startsAt = text(args.starts_at, 100);
    if (!startsAt) return { ok: false, status: "not_booked", message: "Ask the caller for a specific date and time before booking." };
    const appointment = await createVoiceAppointment({
      tenantId, brandId, leadId: contact.leadId, customerId: contact.customerId, providerCallId,
      startsAt, durationMinutes: Number(args.duration_minutes ?? 60), confirmedBySignedTool: true,
      service: text(args.service, 200)
    });
    return { ...appointment, message: appointment.reason };
  }
  if (name === "create_follow_up") {
    const reason = text(args.reason, 1000);
    if (!reason) return { ok: false, status: "not_created", message: "Collect the reason for follow-up before confirming it." };
    const preferred = text(args.preferred_time, 100);
    const preferredDate = preferred ? new Date(preferred) : null;
    const startsAt = preferredDate && Number.isFinite(preferredDate.getTime()) ? preferredDate.toISOString() : null;
    const saved = await queryPostgres<{ id: string }>(
      `insert into public.operator_schedule_events (tenant_id,brand_id,event_type,title,status,starts_at,reminder_policy_json,metadata_json)
       select $1,$2,'callback',$3,'scheduled',coalesce($4::timestamptz,now()),'{"ownerQueue":true}'::jsonb,$5::jsonb
       where not exists (select 1 from public.operator_schedule_events where tenant_id=$1 and metadata_json->>'providerCallId'=$6 and metadata_json->>'source'='retell_business_tool')
       returning id`,
      [tenantId, brandId, `Follow up with ${text(args.caller_name, 160) ?? callerNumber ?? "caller"}`,
        startsAt, JSON.stringify({ source: "retell_business_tool", providerCallId, reason, urgency: text(args.urgency, 20) ?? "normal", preferredTime: preferred, customerId: contact.customerId, leadId: contact.leadId }), providerCallId]
    );
    const existing = saved?.rows[0]?.id ?? (await queryPostgres<{ id: string }>(
      `select id from public.operator_schedule_events where tenant_id=$1 and metadata_json->>'providerCallId'=$2 and metadata_json->>'source'='retell_business_tool' limit 1`, [tenantId, providerCallId]
    ))?.rows[0]?.id;
    return { ok: Boolean(existing), status: existing ? "follow_up_created" : "not_created", request_id: existing, message: existing ? "The follow-up is in Ferocity. Do not promise an exact time unless the schedule confirms one." : "The follow-up could not be saved." };
  }
  return { ok: false, message: "That phone action is not supported." };
}
