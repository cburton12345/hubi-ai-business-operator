import "server-only";

import { queryPostgres } from "@/lib/db/postgres";
import { planLeadFollowUp, type FollowUpCandidate } from "./follow-up-intelligence";

type CandidateRow = {
  lead_id: string;
  brand_id: string;
  status: FollowUpCandidate["status"];
  priority: FollowUpCandidate["priority"];
  lead_score: number | null;
  source: string | null;
  message: string | null;
  service_interest: string | null;
  urgency: string | null;
  lost_reason: string | null;
  days_inactive: number;
  previous_touches: number;
  phone: string | null;
  email: string | null;
  consent_to_contact: boolean;
  response_stop_active: boolean;
  open_conversation: boolean;
};

export type ContextAwareFollowUpResult = {
  prepared: number;
  preparedNurture: number;
  preparedReactivation: number;
  skippedActiveConversation: number;
  cappedForReview: number;
  manualOnly: number;
};

export async function prepareContextAwareLeadFollowUps(tenantId: string): Promise<ContextAwareFollowUpResult> {
  const candidates = await queryPostgres<CandidateRow>(
    `
    select
      l.id as lead_id,
      l.brand_id,
      l.status,
      l.priority,
      l.lead_score,
      l.source,
      l.message,
      details.service_interest,
      details.urgency,
      nullif(coalesce(l.metadata_json->>'lostReason', l.metadata_json->>'lost_reason'), '') as lost_reason,
      greatest(1, floor(extract(epoch from (now() - greatest(l.created_at, l.updated_at))) / 86400))::int as days_inactive,
      (
        select count(*)::int from public.follow_up_workflows f
        where f.tenant_id=l.tenant_id and f.lead_id=l.id
          and f.workflow_type in ('stale_lead_recovery','nurture','database_reactivation')
          and f.created_at >= now() - interval '180 days'
      ) as previous_touches,
      l.phone,
      l.email,
      l.consent_to_contact,
      exists (
        select 1 from public.customer_response_stops stop
        where stop.tenant_id=l.tenant_id and stop.lead_id=l.id and stop.active=true
      ) as response_stop_active,
      exists (
        select 1 from public.messaging_conversations conversation
        where conversation.tenant_id=l.tenant_id and conversation.lead_id=l.id
          and conversation.status in ('waiting_on_team','open')
      ) as open_conversation
    from public.leads l
    left join public.local_service_lead_details details
      on details.tenant_id=l.tenant_id and details.lead_id=l.id
    where l.tenant_id=$1
      and l.status in ('new','contacted','qualified','lost')
      and (
        (l.status='new' and greatest(l.created_at,l.updated_at) < now() - interval '1 day')
        or (l.status='contacted' and greatest(l.created_at,l.updated_at) < now() - interval '5 days')
        or (l.status='qualified' and greatest(l.created_at,l.updated_at) < now() - interval '3 days')
        or (l.status='lost' and greatest(l.created_at,l.updated_at) < now() - interval '90 days')
      )
      and not exists (
        select 1 from public.follow_up_workflows open_followup
        where open_followup.tenant_id=l.tenant_id and open_followup.lead_id=l.id
          and open_followup.workflow_type in ('stale_lead_recovery','nurture','database_reactivation')
          and open_followup.status in ('open','scheduled')
      )
    order by
      case l.priority when 'high' then 0 when 'normal' then 1 else 2 end,
      coalesce(l.lead_score,0) desc,
      greatest(l.created_at,l.updated_at) asc
    limit 200
    `,
    [tenantId]
  );

  const result: ContextAwareFollowUpResult = { prepared: 0, preparedNurture: 0, preparedReactivation: 0, skippedActiveConversation: 0, cappedForReview: 0, manualOnly: 0 };
  for (const row of candidates?.rows ?? []) {
    const plan = planLeadFollowUp({
      leadId: row.lead_id,
      status: row.status,
      priority: row.priority,
      leadScore: row.lead_score,
      source: row.source,
      originalRequest: row.message,
      serviceInterest: row.service_interest,
      urgency: row.urgency,
      lostReason: row.lost_reason,
      daysInactive: Number(row.days_inactive),
      previousTouches: Number(row.previous_touches),
      hasPhone: Boolean(row.phone),
      hasEmail: Boolean(row.email),
      consentToContact: row.consent_to_contact,
      responseStopActive: row.response_stop_active,
      openConversation: row.open_conversation
    });
    if (!plan.eligible) {
      if (plan.strategyKey === "frequency_cap_review") result.cappedForReview += 1;
      else result.skippedActiveConversation += 1;
      continue;
    }
    const workflowType = plan.segment === "long_term_reactivation" ? "database_reactivation" : plan.segment === "new_unreached" ? "stale_lead_recovery" : "nurture";
    const inserted = await queryPostgres<{ id: string }>(
      `
      insert into public.follow_up_workflows (
        tenant_id,brand_id,lead_id,workflow_type,channel,status,due_at,ai_suggested_message,metadata_json
      )
      select $1,$2,$3,$4,$5,'open',now()+make_interval(hours => $6),$7,$8::jsonb
      where not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id=$1 and f.lead_id=$3 and f.workflow_type=$4 and f.status in ('open','scheduled')
      )
      returning id
      `,
      [
        tenantId,
        row.brand_id,
        row.lead_id,
        workflowType,
        plan.channel,
        plan.dueInHours,
        plan.suggestedMessage,
        JSON.stringify({
          createdByAgent: "context_aware_follow_up_planner",
          liveCustomerSend: false,
          requiresApproval: plan.requiresApproval,
          strategyKey: plan.strategyKey,
          segment: plan.segment,
          sequenceStep: plan.sequenceStep,
          experimentVariant: plan.experimentVariant,
          confidenceScore: plan.confidenceScore,
          decisionReason: plan.reason,
          safeguards: plan.safeguards,
          contextSnapshot: {
            status: row.status,
            priority: row.priority,
            leadScore: row.lead_score,
            source: row.source,
            serviceInterest: row.service_interest,
            urgency: row.urgency,
            lostReason: row.lost_reason,
            daysInactive: Number(row.days_inactive),
            previousTouches: Number(row.previous_touches)
          }
        })
      ]
    );
    if (inserted?.rows[0]) {
      result.prepared += 1;
      if (workflowType === "database_reactivation") result.preparedReactivation += 1;
      else result.preparedNurture += 1;
      if (plan.channel === "manual") result.manualOnly += 1;
    }
  }
  return result;
}
