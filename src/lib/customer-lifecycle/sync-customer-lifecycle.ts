import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

export type CustomerLifecycleSyncResult = {
  missedCallRecoveries: number;
  estimateFollowups: number;
  nurtureTouches: number;
  databaseReactivations: number;
  referralRequests: number;
  lifetimeValueCampaigns: number;
};

function count(result: { rowCount?: number | null } | null) {
  return Number(result?.rowCount ?? 0);
}

export async function syncCustomerLifecycleForTenant(tenantId: string): Promise<CustomerLifecycleSyncResult> {
  const appUrl = (env.FEROCITY_APP_URL || "https://ferocity.live").replace(/\/+$/, "");
  const missedCalls = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, customer_id, workflow_type, channel, status, due_at,
      ai_suggested_message, metadata_json
    )
    select c.tenant_id, c.brand_id, c.lead_id, c.customer_id, 'missed_call_recovery',
      case when l.consent_to_contact = true and l.phone is not null then 'sms' else 'phone' end,
      'open', now(),
      case when l.consent_to_contact = true and l.phone is not null
        then 'Sorry we missed your call. How can we help, and is there a good time to reach you?'
        else 'Return the missed call, review any transcript or summary, and record the outcome.' end,
      jsonb_build_object('createdByAgent', 'customer_lifecycle_agent', 'receptionistCallId', c.id, 'reason', c.status, 'liveCustomerSend', false)
    from public.receptionist_calls c
    left join public.leads l on l.tenant_id = c.tenant_id and l.id = c.lead_id
    where c.tenant_id = $1
      and c.direction = 'inbound'
      and (c.status in ('missed','failed') or c.outcome in ('followup_needed','unresolved','failed'))
      and c.follow_up_status in ('none','needed')
      and coalesce(c.caller_number, l.phone) is not null
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = c.tenant_id
          and f.metadata_json->>'receptionistCallId' = c.id::text
          and f.status in ('open','scheduled','completed')
      )
    order by c.started_at desc
    limit 50
    `,
    [tenantId]
  );
  await queryPostgres(
    `
    update public.receptionist_calls c
    set follow_up_status = 'created', updated_at = now()
    where c.tenant_id = $1 and c.follow_up_status in ('none','needed')
      and exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = c.tenant_id
          and f.metadata_json->>'receptionistCallId' = c.id::text
          and f.status in ('open','scheduled','completed')
      )
    `,
    [tenantId]
  );

  const estimates = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, customer_id, estimate_id, workflow_type, channel, status,
      due_at, ai_suggested_message, metadata_json
    )
    select e.tenant_id, e.brand_id, e.source_lead_id, e.customer_id, e.id, 'estimate_followup',
      case when l.consent_to_contact = true and l.phone is not null then 'sms'
        when l.consent_to_contact = true and l.email is not null then 'email' else 'manual' end,
      'open', now(),
      'I wanted to make sure you received the estimate and see whether any scope, option, timing, or next-step questions would be useful.',
      jsonb_build_object('createdByAgent', 'customer_lifecycle_agent', 'estimateId', e.id, 'estimateValueCents', e.total_cents, 'liveCustomerSend', false)
    from public.service_estimates e
    left join public.leads l on l.tenant_id = e.tenant_id and l.id = e.source_lead_id
    where e.tenant_id = $1 and e.status = 'sent_manually'
      and e.updated_at < now() - interval '2 days'
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = e.tenant_id and f.estimate_id = e.id
          and f.workflow_type = 'estimate_followup' and f.status in ('open','scheduled','completed')
      )
    order by e.total_cents desc, e.updated_at
    limit 50
    `,
    [tenantId]
  );

  const nurture = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, 'nurture',
      case when l.phone is not null then 'sms' when l.email is not null then 'email' else 'manual' end,
      'open', now(),
      'Check in with one useful answer, proof point, or next step based on the original request. Stop if they reply, opt out, book, or buy.',
      jsonb_build_object('createdByAgent', 'customer_lifecycle_agent', 'lifecycleStage', 'short_term_nurture', 'liveCustomerSend', false)
    from public.leads l
    where l.tenant_id = $1 and l.status in ('new','contacted','qualified')
      and l.consent_to_contact = true
      and l.updated_at between now() - interval '60 days' and now() - interval '7 days'
      and (l.phone is not null or l.email is not null)
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = l.tenant_id and f.lead_id = l.id
          and f.workflow_type in ('nurture','database_reactivation')
          and f.created_at >= now() - interval '14 days'
          and f.status in ('open','scheduled','completed')
      )
    order by l.updated_at
    limit 50
    `,
    [tenantId]
  );

  const reactivation = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, 'database_reactivation',
      case when l.phone is not null then 'sms' when l.email is not null then 'email' else 'manual' end,
      'open', now(),
      'Reconnect with context from the original request. Offer a useful update or simple next step, not a generic blast. Stop on reply, opt-out, booking, or sale.',
      jsonb_build_object('createdByAgent', 'customer_lifecycle_agent', 'lifecycleStage', 'database_reactivation', 'liveCustomerSend', false)
    from public.leads l
    where l.tenant_id = $1 and l.status in ('new','contacted','lost')
      and l.consent_to_contact = true
      and l.updated_at < now() - interval '90 days'
      and (l.phone is not null or l.email is not null)
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = l.tenant_id and f.lead_id = l.id
          and f.workflow_type = 'database_reactivation'
          and f.created_at >= now() - interval '180 days'
          and f.status in ('open','scheduled','completed')
      )
    order by l.updated_at
    limit 100
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    insert into public.customer_referral_links (
      tenant_id, brand_id, customer_id, form_id, referral_token, status, metadata_json
    )
    select c.tenant_id, c.brand_id, c.id, f.id, encode(gen_random_bytes(18), 'hex'),
      'active', jsonb_build_object('createdByAgent', 'customer_lifecycle_agent')
    from public.customers c
    join lateral (
      select id from public.forms
      where tenant_id = c.tenant_id and brand_id = c.brand_id and active = true
      order by created_at limit 1
    ) f on true
    where c.tenant_id = $1 and c.status = 'active'
    on conflict (tenant_id, customer_id, form_id) do update
    set status = case when public.customer_referral_links.status = 'archived' then 'archived' else 'active' end,
        updated_at = now()
    `,
    [tenantId]
  );

  const referrals = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, customer_id, workflow_type, channel, status, due_at,
      ai_suggested_message, metadata_json
    )
    select j.tenant_id, j.brand_id, j.source_lead_id, j.customer_id, 'referral_request',
      case when l.consent_to_contact = true and l.phone is not null then 'sms'
        when l.consent_to_contact = true and l.email is not null then 'email' else 'manual' end,
      'open', now(),
      'Thank the customer for the completed work and, only if they are satisfied, make it easy to introduce someone who may need similar help: ' || $2 || '/refer/' || referral.referral_token,
      jsonb_build_object('createdByAgent', 'customer_lifecycle_agent', 'jobId', j.id, 'referralLinkId', referral.id, 'attributionRequired', true, 'liveCustomerSend', false)
    from public.service_jobs j
    left join public.leads l on l.tenant_id = j.tenant_id and l.id = j.source_lead_id
    join lateral (
      select id, referral_token
      from public.customer_referral_links
      where tenant_id = j.tenant_id and customer_id = j.customer_id and status = 'active'
      order by created_at
      limit 1
    ) referral on true
    where j.tenant_id = $1 and j.status = 'completed'
      and j.updated_at between now() - interval '120 days' and now() - interval '14 days'
      and not exists (
        select 1 from public.service_invoices i
        where i.tenant_id = j.tenant_id and i.job_id = j.id and i.status in ('overdue','partially_paid')
      )
      and exists (
        select 1 from public.review_request_workflows r
        where r.tenant_id = j.tenant_id and r.job_id = j.id
          and (r.rating_received >= 4 or r.status = 'completed')
          and r.negative_interception_status <> 'needs_service_recovery'
      )
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = j.tenant_id and f.workflow_type = 'referral_request'
          and f.metadata_json->>'jobId' = j.id::text
      )
    order by j.updated_at desc
    limit 50
    `,
    [tenantId, appUrl]
  );

  const lifetimeValue = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, customer_id, workflow_type, channel, status, due_at,
      ai_suggested_message, metadata_json
    )
    select c.tenant_id, c.brand_id, c.source_lead_id, c.id, 'customer_lifetime_value',
      case when l.consent_to_contact = true and l.phone is not null then 'sms'
        when l.consent_to_contact = true and l.email is not null then 'email' else 'manual' end,
      'open', now(),
      'Use the verified service history to offer a timely inspection, maintenance check, complementary service, or useful seasonal guidance. Do not invent a need.',
      jsonb_build_object('createdByAgent', 'customer_lifecycle_agent', 'customerId', c.id, 'lifecycleStage', 'past_customer', 'liveCustomerSend', false)
    from public.customers c
    left join public.leads l on l.tenant_id = c.tenant_id and l.id = c.source_lead_id
    where c.tenant_id = $1 and c.status = 'active'
      and exists (
        select 1 from public.service_jobs j
        where j.tenant_id = c.tenant_id and j.customer_id = c.id and j.status = 'completed'
          and j.updated_at < now() - interval '180 days'
      )
      and not exists (
        select 1 from public.service_jobs open_job
        where open_job.tenant_id = c.tenant_id and open_job.customer_id = c.id
          and open_job.status in ('unscheduled','scheduled','in_progress')
      )
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = c.tenant_id and f.customer_id = c.id
          and f.workflow_type = 'customer_lifetime_value'
          and f.created_at >= now() - interval '180 days'
      )
    order by c.updated_at
    limit 100
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    update public.customer_referral_links referral
    set attributed_revenue_cents = revenue.total_paid_cents, updated_at = now()
    from (
      select referral_inner.id,
        coalesce(sum(least(invoice.amount_paid_cents, invoice.total_cents)), 0)::integer as total_paid_cents
      from public.customer_referral_links referral_inner
      join public.leads lead
        on lead.tenant_id = referral_inner.tenant_id
        and lead.brand_id = referral_inner.brand_id
        and lead.metadata_json->'details'->>'referralToken' = referral_inner.referral_token
      join public.service_jobs job
        on job.tenant_id = lead.tenant_id and job.source_lead_id = lead.id
      join public.service_invoices invoice
        on invoice.tenant_id = job.tenant_id and invoice.job_id = job.id and invoice.status <> 'void'
      where referral_inner.tenant_id = $1
      group by referral_inner.id
    ) revenue
    where referral.id = revenue.id
      and referral.attributed_revenue_cents <> revenue.total_paid_cents
    `,
    [tenantId]
  );

  const result = {
    missedCallRecoveries: count(missedCalls),
    estimateFollowups: count(estimates),
    nurtureTouches: count(nurture),
    databaseReactivations: count(reactivation),
    referralRequests: count(referrals),
    lifetimeValueCampaigns: count(lifetimeValue)
  };
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    await queryPostgres(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, risk_type, confidence_score, metadata_json
      )
      values ($1, 'ferocity', 'Ferocity', $2, 'customer_lifecycle.work_prepared',
        'Customer Lifecycle Manager prepared revenue work', $3, 'medium', 'ai_handled',
        false, true, $3, 'Open the Action Queue to review authorized customer touches.',
        '/app/actions', 'revenue', 88, $4::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
      do update set summary = excluded.summary, ai_summary = excluded.ai_summary,
        metadata_json = excluded.metadata_json, occurred_at = now(), updated_at = now()
      `,
      [
        tenantId,
        `customer-lifecycle:${new Date().toISOString().slice(0, 10)}`,
        `Prepared ${total} lifecycle action(s): ${result.missedCallRecoveries} missed calls, ${result.estimateFollowups} estimates, ${result.nurtureTouches} nurture, ${result.databaseReactivations} reactivations, ${result.referralRequests} referrals, and ${result.lifetimeValueCampaigns} past-customer opportunities.`,
        JSON.stringify(result)
      ]
    );
  }
  return result;
}
