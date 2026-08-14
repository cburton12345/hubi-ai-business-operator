import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type CallInboxFilter = "all" | "new_lead" | "existing_customer" | "scheduled" | "missed" | "transferred" | "needs_follow_up" | "spam" | "failed" | "after_hours" | "unresolved";

export type CallInboxRow = {
  id: string;
  callerNumber: string;
  calledNumber: string;
  providerKey: string;
  status: string;
  direction: string;
  outcome: string;
  sentiment: string;
  leadQualification: string;
  durationSeconds: number;
  startedAt: string;
  summary: string;
  actionItems: string[];
  followUpStatus: string;
  customerId: string | null;
  leadId: string | null;
  jobId: string | null;
  transcriptStatus: string | null;
  recordingStatus: string | null;
  usageUnits: number;
  billableCustomerAmountCents: number;
  priorityClass: string | null;
  callDecision: string | null;
  shouldInterruptOwner: boolean;
  callerContext: string | null;
  screeningSummary: string | null;
  decisionReason: string | null;
  decisionStatus: string | null;
  ownerResponse: string | null;
};

export type CallInboxDashboard = {
  metrics: {
    total: number;
    unresolved: number;
    needsFollowUp: number;
    missed: number;
    spam: number;
    failed: number;
    billableCents: number;
    usageMinutes: number;
  };
  rows: CallInboxRow[];
  filter: CallInboxFilter;
};

export type CallDetail = CallInboxRow & {
  transcriptText: string | null;
  redactedTranscriptText: string | null;
  transcriptConsentStatus: string | null;
  recordingConsentStatus: string | null;
  events: Array<{ id: string; type: string; status: string; occurredAt: string }>;
  turns: Array<{ id: string; speaker: string; content: string; occurredAt: string }>;
};

const filters = new Set<CallInboxFilter>([
  "all",
  "new_lead",
  "existing_customer",
  "scheduled",
  "missed",
  "transferred",
  "needs_follow_up",
  "spam",
  "failed",
  "after_hours",
  "unresolved"
]);

export function cleanCallInboxFilter(value: string | undefined): CallInboxFilter {
  return value && filters.has(value as CallInboxFilter) ? (value as CallInboxFilter) : "all";
}

function whereForFilter(filter: CallInboxFilter) {
  switch (filter) {
    case "new_lead":
    case "existing_customer":
    case "scheduled":
    case "transferred":
    case "spam":
    case "failed":
      return "and c.outcome = $2";
    case "missed":
      return "and c.status = 'missed'";
    case "needs_follow_up":
      return "and c.follow_up_status in ('needed','created')";
    case "after_hours":
      return "and coalesce(c.metadata_json->>'afterHours','false') = 'true'";
    case "unresolved":
      return "and (c.outcome is null or c.outcome = 'unresolved' or c.follow_up_status = 'needed')";
    default:
      return "";
  }
}

function filterValue(filter: CallInboxFilter) {
  if (["new_lead", "existing_customer", "scheduled", "transferred", "spam", "failed"].includes(filter)) return filter;
  return null;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asActionItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 8);
}

export async function getCallInboxDashboard(filter: CallInboxFilter): Promise<CallInboxDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const where = whereForFilter(filter);
  const value = filterValue(filter);
  const params = value ? [workspaceId, value] : [workspaceId];

  const [metricResult, rowResult] = await Promise.all([
    queryPostgres<Record<string, string>>(
      `
      select
        count(*)::text as total,
        count(*) filter (where outcome is null or outcome = 'unresolved' or follow_up_status = 'needed')::text as unresolved,
        count(*) filter (where follow_up_status in ('needed','created'))::text as needs_follow_up,
        count(*) filter (where status = 'missed')::text as missed,
        count(*) filter (where outcome = 'spam' or status = 'spam')::text as spam,
        count(*) filter (where outcome = 'failed' or status = 'failed')::text as failed,
        coalesce(sum(billable_customer_amount_cents), 0)::text as billable_cents,
        coalesce(sum(usage_units), 0)::text as usage_minutes
      from public.receptionist_calls
      where tenant_id = $1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      caller_number: string | null;
      called_number: string | null;
      provider_key: string;
      status: string;
      direction: string;
      outcome: string | null;
      sentiment: string | null;
      lead_qualification: string | null;
      duration_seconds: number;
      started_at: Date | string;
      summary: string | null;
      action_items_json: unknown;
      follow_up_status: string;
      customer_id: string | null;
      lead_id: string | null;
      service_job_id: string | null;
      transcript_status: string | null;
      recording_status: string | null;
      usage_units: string;
      billable_customer_amount_cents: string;
      priority_class: string | null;
      call_decision: string | null;
      should_interrupt_owner: boolean | null;
      caller_context: string | null;
      screening_summary: string | null;
      decision_reason: string | null;
      decision_status: string | null;
      owner_response: string | null;
    }>(
      `
      select
        c.id,
        c.caller_number,
        c.called_number,
        c.provider_key,
        c.status,
        c.direction,
        c.outcome,
        c.sentiment,
        c.lead_qualification,
        c.duration_seconds,
        c.started_at,
        c.summary,
        c.action_items_json,
        c.follow_up_status,
        c.customer_id,
        c.lead_id,
        c.service_job_id,
        t.status as transcript_status,
        r.status as recording_status,
        c.usage_units::text,
        c.billable_customer_amount_cents::text,
        d.priority_class,
        d.decision as call_decision,
        d.should_interrupt_owner,
        d.caller_context,
        d.screening_summary,
        d.decision_reason,
        d.status as decision_status,
        d.owner_response
      from public.receptionist_calls c
      left join public.receptionist_call_transcripts t on t.tenant_id = c.tenant_id and t.call_id = c.id
      left join public.receptionist_call_recordings r on r.tenant_id = c.tenant_id and r.call_id = c.id
      left join public.call_management_decisions d on d.tenant_id = c.tenant_id and d.call_id = c.id
      where c.tenant_id = $1
      ${where}
      order by c.started_at desc
      limit 50
      `,
      params
    )
  ]);

  const metric = metricResult?.rows[0] ?? {};

  return {
    metrics: {
      total: Number(metric.total ?? 0),
      unresolved: Number(metric.unresolved ?? 0),
      needsFollowUp: Number(metric.needs_follow_up ?? 0),
      missed: Number(metric.missed ?? 0),
      spam: Number(metric.spam ?? 0),
      failed: Number(metric.failed ?? 0),
      billableCents: Number(metric.billable_cents ?? 0),
      usageMinutes: Number(metric.usage_minutes ?? 0)
    },
    rows: (rowResult?.rows ?? []).map((row) => ({
      id: row.id,
      callerNumber: row.caller_number ?? "Unknown caller",
      calledNumber: row.called_number ?? "Unknown number",
      providerKey: row.provider_key,
      status: row.status,
      direction: row.direction,
      outcome: row.outcome ?? "unresolved",
      sentiment: row.sentiment ?? "unknown",
      leadQualification: row.lead_qualification ?? "unknown",
      durationSeconds: Number(row.duration_seconds ?? 0),
      startedAt: iso(row.started_at),
      summary: row.summary ?? "No summary yet.",
      actionItems: asActionItems(row.action_items_json),
      followUpStatus: row.follow_up_status,
      customerId: row.customer_id,
      leadId: row.lead_id,
      jobId: row.service_job_id,
      transcriptStatus: row.transcript_status,
      recordingStatus: row.recording_status,
      usageUnits: Number(row.usage_units ?? 0),
      billableCustomerAmountCents: Number(row.billable_customer_amount_cents ?? 0),
      priorityClass: row.priority_class,
      callDecision: row.call_decision,
      shouldInterruptOwner: Boolean(row.should_interrupt_owner),
      callerContext: row.caller_context,
      screeningSummary: row.screening_summary,
      decisionReason: row.decision_reason,
      decisionStatus: row.decision_status,
      ownerResponse: row.owner_response
    })),
    filter
  };
}

export async function getCallDetail(callId: string): Promise<CallDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string; caller_number: string | null; called_number: string | null; provider_key: string;
    status: string; direction: string; outcome: string | null; sentiment: string | null;
    lead_qualification: string | null; duration_seconds: number; started_at: Date | string;
    summary: string | null; action_items_json: unknown; follow_up_status: string;
    customer_id: string | null; lead_id: string | null; service_job_id: string | null;
    transcript_status: string | null; recording_status: string | null; usage_units: string;
    billable_customer_amount_cents: string; priority_class: string | null; call_decision: string | null;
    should_interrupt_owner: boolean | null; caller_context: string | null; screening_summary: string | null;
    decision_reason: string | null; decision_status: string | null; owner_response: string | null;
    transcript_text: string | null; redacted_transcript_text: string | null;
    transcript_consent_status: string | null; recording_consent_status: string | null;
  }>(
    `select c.id,c.caller_number,c.called_number,c.provider_key,c.status,c.direction,c.outcome,c.sentiment,
       c.lead_qualification,c.duration_seconds,c.started_at,c.summary,c.action_items_json,c.follow_up_status,
       c.customer_id,c.lead_id,c.service_job_id,c.usage_units::text,c.billable_customer_amount_cents::text,
       t.status as transcript_status,t.transcript_text,t.redacted_transcript_text,
       t.consent_status as transcript_consent_status,r.status as recording_status,
       r.consent_status as recording_consent_status,d.priority_class,d.decision as call_decision,
       d.should_interrupt_owner,d.caller_context,d.screening_summary,d.decision_reason,
       d.status as decision_status,d.owner_response
     from public.receptionist_calls c
     left join public.receptionist_call_transcripts t on t.tenant_id=c.tenant_id and t.call_id=c.id
     left join public.receptionist_call_recordings r on r.tenant_id=c.tenant_id and r.call_id=c.id
     left join public.call_management_decisions d on d.tenant_id=c.tenant_id and d.call_id=c.id
     where c.tenant_id=$1 and c.id=$2 limit 1`,
    [workspaceId, callId]
  );
  const row = result?.rows[0];
  if (!row) return null;
  const [eventResult, turnResult] = await Promise.all([
    queryPostgres<{ id: string; event_type: string; event_status: string; occurred_at: Date | string }>(
      `select id,event_type,event_status,occurred_at from public.receptionist_call_events
       where tenant_id=$1 and call_id=$2 order by occurred_at asc`, [workspaceId, callId]
    ),
    queryPostgres<{ id: string; speaker_type: string; content: string; occurred_at: Date | string }>(
      `select t.id,t.speaker_type,t.content,t.occurred_at
       from public.office_manager_conversation_turns t
       join public.receptionist_calls c on c.tenant_id=t.tenant_id and c.office_manager_session_id=t.session_id
       where c.tenant_id=$1 and c.id=$2 order by t.occurred_at asc`, [workspaceId, callId]
    )
  ]);
  return {
    id: row.id, callerNumber: row.caller_number ?? "Unknown caller", calledNumber: row.called_number ?? "Unknown number",
    providerKey: row.provider_key, status: row.status, direction: row.direction, outcome: row.outcome ?? "unresolved",
    sentiment: row.sentiment ?? "unknown", leadQualification: row.lead_qualification ?? "unknown",
    durationSeconds: Number(row.duration_seconds ?? 0), startedAt: iso(row.started_at), summary: row.summary ?? "No summary yet.",
    actionItems: asActionItems(row.action_items_json), followUpStatus: row.follow_up_status, customerId: row.customer_id,
    leadId: row.lead_id, jobId: row.service_job_id, transcriptStatus: row.transcript_status,
    recordingStatus: row.recording_status, usageUnits: Number(row.usage_units ?? 0),
    billableCustomerAmountCents: Number(row.billable_customer_amount_cents ?? 0), priorityClass: row.priority_class,
    callDecision: row.call_decision, shouldInterruptOwner: Boolean(row.should_interrupt_owner), callerContext: row.caller_context,
    screeningSummary: row.screening_summary, decisionReason: row.decision_reason, decisionStatus: row.decision_status,
    ownerResponse: row.owner_response, transcriptText: row.transcript_text, redactedTranscriptText: row.redacted_transcript_text,
    transcriptConsentStatus: row.transcript_consent_status, recordingConsentStatus: row.recording_consent_status,
    events: (eventResult?.rows ?? []).map((event) => ({ id: event.id, type: event.event_type, status: event.event_status, occurredAt: iso(event.occurred_at) })),
    turns: (turnResult?.rows ?? []).map((turn) => ({ id: turn.id, speaker: turn.speaker_type, content: turn.content, occurredAt: iso(turn.occurred_at) }))
  };
}
