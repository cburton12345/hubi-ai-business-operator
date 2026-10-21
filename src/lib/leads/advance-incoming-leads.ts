import { queryPostgres } from "@/lib/db/postgres";

type ResponseCandidate = {
  lead_id: string;
  brand_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  lead_type: string;
  service_interest: string | null;
  appointment_window: string | null;
};

export type IncomingLeadAutonomyResult = {
  duplicatesLinked: number;
  customersCreated: number;
  customersUpdated: number;
  opportunitiesCreated: number;
  opportunitiesUpdated: number;
  threadsCreated: number;
  initialResponsesPrepared: number;
  incompleteLeadsEscalated: number;
};

function changed(result: { rowCount?: number | null } | null) {
  return Number(result?.rowCount ?? 0);
}

function compact(value: string | null | undefined, max = 120) {
  return value?.replace(/\s+/g, " ").trim().slice(0, max) || null;
}

export function buildInitialLeadResponse(candidate: Pick<ResponseCandidate, "name" | "message" | "lead_type" | "service_interest" | "appointment_window">) {
  const firstName = compact(candidate.name, 80)?.split(" ")[0];
  const interest = compact(candidate.service_interest, 100);
  const request = compact(candidate.message, 140);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  if (candidate.lead_type === "appointment" && candidate.appointment_window) {
    return `${greeting} thanks for reaching out${interest ? ` about ${interest}` : ""}. I have your preferred window as ${compact(candidate.appointment_window, 100)}. Is that still the best timing, and is there anything we should know before scheduling?`;
  }
  if (interest) {
    return `${greeting} thanks for reaching out about ${interest}. What outcome are you hoping for, and is there a deadline or timing constraint we should account for?`;
  }
  if (request) {
    return `${greeting} thanks for reaching out. I have your request: “${request}” What is the best next detail we should confirm so we can move this forward?`;
  }
  return `${greeting} thanks for reaching out. What can we help with, and is there a deadline or preferred timing we should account for?`;
}

export async function advanceIncomingLeadsForTenant(
  tenantId: string,
  query: typeof queryPostgres = queryPostgres,
): Promise<IncomingLeadAutonomyResult> {
  const duplicates = await query(
    `
    with duplicate_matches as (
      select l.id,
        (
          select earlier.id
          from public.leads earlier
          where earlier.tenant_id = l.tenant_id
            and earlier.id <> l.id
            and (earlier.created_at, earlier.id) < (l.created_at, l.id)
            and (
              (l.email is not null and earlier.email is not null and lower(earlier.email) = lower(l.email))
              or (nullif(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), '') is not null
                and right(regexp_replace(coalesce(earlier.phone, ''), '\\D', '', 'g'), 10)
                  = right(regexp_replace(l.phone, '\\D', '', 'g'), 10))
            )
          order by earlier.created_at, earlier.id
          limit 1
        ) as canonical_lead_id
      from public.leads l
      where l.tenant_id = $1 and l.status <> 'spam'
    )
    update public.leads l
    set metadata_json = l.metadata_json || jsonb_build_object(
          'duplicateOfLeadId', matches.canonical_lead_id,
          'duplicateDetectedAt', now(),
          'duplicateDetectionMethod', 'normalized_contact_identity'
        ),
        updated_at = now()
    from duplicate_matches matches
    where l.tenant_id = $1 and l.id = matches.id and matches.canonical_lead_id is not null
      and coalesce(l.metadata_json->>'duplicateOfLeadId', '') <> matches.canonical_lead_id::text
    `,
    [tenantId],
  );

  const customers = await query(
    `
    insert into public.customers (tenant_id, brand_id, source_lead_id, name, email, phone, status, ai_summary)
    select l.tenant_id, l.brand_id, l.id,
      coalesce(nullif(l.name, ''), nullif(l.email, ''), nullif(l.phone, ''), 'Qualified lead'),
      nullif(lower(l.email), ''), nullif(l.phone, ''), 'active',
      'Created automatically after deterministic lead qualification. Contact identity and source lead are preserved.'
    from public.leads l
    where l.tenant_id = $1
      and l.status in ('new', 'contacted', 'qualified')
      and l.qualification_status = 'qualified'
      and not (l.metadata_json ? 'duplicateOfLeadId')
      and (nullif(l.email, '') is not null or nullif(l.phone, '') is not null)
      and not exists (
        select 1 from public.customers c
        where c.tenant_id = l.tenant_id and (
          (l.email is not null and c.email is not null and lower(c.email) = lower(l.email))
          or (nullif(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), '') is not null
            and right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10)
              = right(regexp_replace(l.phone, '\\D', '', 'g'), 10))
        )
      )
    order by l.created_at
    limit 200
    `,
    [tenantId],
  );

  const customersUpdated = await query(
    `
    with newest_matching_lead as (
      select distinct on (c.id) c.id as customer_id, l.id as lead_id, l.name, l.email, l.phone, l.brand_id
      from public.customers c
      join public.leads l on l.tenant_id = c.tenant_id and (
        (l.email is not null and c.email is not null and lower(c.email) = lower(l.email))
        or (nullif(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), '') is not null
          and right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10)
            = right(regexp_replace(l.phone, '\\D', '', 'g'), 10))
      )
      where c.tenant_id = $1 and l.status <> 'spam' and l.qualification_status = 'qualified'
      order by c.id, l.created_at desc
    )
    update public.customers c
    set brand_id = coalesce(c.brand_id, newest.brand_id),
        source_lead_id = coalesce(c.source_lead_id, newest.lead_id),
        name = case when c.name in ('Qualified lead', 'New customer') then coalesce(nullif(newest.name, ''), c.name) else c.name end,
        email = coalesce(nullif(c.email, ''), nullif(lower(newest.email), '')),
        phone = coalesce(nullif(c.phone, ''), nullif(newest.phone, '')),
        updated_at = now()
    from newest_matching_lead newest
    where c.tenant_id = $1 and c.id = newest.customer_id
      and (
        (c.brand_id is null and newest.brand_id is not null)
        or (c.source_lead_id is null and newest.lead_id is not null)
        or (nullif(c.email, '') is null and nullif(newest.email, '') is not null)
        or (nullif(c.phone, '') is null and nullif(newest.phone, '') is not null)
        or (c.name in ('Qualified lead', 'New customer') and nullif(newest.name, '') is not null)
      )
    `,
    [tenantId],
  );

  const opportunities = await query(
    `
    insert into public.opportunities (
      tenant_id, brand_id, lead_id, customer_id, stage_id, title, status, value_cents,
      close_probability, next_follow_up_at, source, ai_summary, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, customer.id, stage.id,
      coalesce(nullif(l.name, ''), nullif(details.service_interest, ''), nullif(l.email, ''), nullif(l.phone, ''), 'New opportunity'),
      'open', coalesce(score.estimated_value_cents, 0), stage.default_probability, now(),
      coalesce(l.source, 'unknown'),
      'Ferocity created this opportunity from qualified inbound lead evidence and will continue authorized follow-up.',
      jsonb_build_object('createdBy', 'incoming_lead_autonomy', 'sourceDetail', l.source_detail, 'qualificationStatus', l.qualification_status)
    from public.leads l
    join public.pipeline_stages stage on stage.tenant_id = l.tenant_id and stage.active = true
      and stage.stage_key = case when l.qualification_status = 'qualified' then 'qualified' else 'new' end
    left join public.local_service_lead_details details on details.tenant_id = l.tenant_id and details.lead_id = l.id
    left join public.revenue_lead_scores score on score.tenant_id = l.tenant_id and score.lead_id = l.id
    left join lateral (
      select c.id from public.customers c
      where c.tenant_id = l.tenant_id and (
        (l.email is not null and c.email is not null and lower(c.email) = lower(l.email))
        or (nullif(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), '') is not null
          and right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10)
            = right(regexp_replace(l.phone, '\\D', '', 'g'), 10))
      )
      order by case when c.source_lead_id = l.id then 0 else 1 end, c.updated_at desc
      limit 1
    ) customer on true
    where l.tenant_id = $1
      and l.status in ('new', 'contacted', 'qualified')
      and not (l.metadata_json ? 'duplicateOfLeadId')
      and not exists (
        select 1 from public.opportunities existing
        where existing.tenant_id = l.tenant_id and existing.lead_id = l.id and existing.status <> 'archived'
      )
    order by l.created_at
    limit 200
    `,
    [tenantId],
  );

  const updatedOpportunities = await query(
    `
    with related_leads as (
      select l.id, coalesce(nullif(l.metadata_json->>'duplicateOfLeadId', '')::uuid, l.id) as canonical_lead_id
      from public.leads l where l.tenant_id = $1 and l.status <> 'spam'
    )
    update public.opportunities o
    set customer_id = coalesce(o.customer_id, matched.id),
        next_follow_up_at = case
          when related.id <> related.canonical_lead_id then now()
          when o.status = 'open' and o.next_follow_up_at is null then now()
          else o.next_follow_up_at end,
        metadata_json = case when related.id <> related.canonical_lead_id
          then o.metadata_json || jsonb_build_object('latestRelatedLeadId', related.id, 'relationshipRefreshedAt', now())
          else o.metadata_json end,
        updated_at = now()
    from public.leads l
    join related_leads related on related.id = l.id
    left join lateral (
      select c.id from public.customers c
      where c.tenant_id = l.tenant_id and (
        (l.email is not null and c.email is not null and lower(c.email) = lower(l.email))
        or (nullif(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), '') is not null
          and right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10)
            = right(regexp_replace(l.phone, '\\D', '', 'g'), 10))
      ) order by c.updated_at desc limit 1
    ) matched on true
    where o.tenant_id = $1 and l.tenant_id = o.tenant_id and related.canonical_lead_id = o.lead_id
      and o.status = 'open'
      and (o.customer_id is null or o.next_follow_up_at is null or related.id <> related.canonical_lead_id)
    `,
    [tenantId],
  );

  const threads = await query(
    `
    insert into public.communication_threads (
      tenant_id, brand_id, lead_id, customer_id, subject, channel, status,
      next_follow_up_at, unanswered_since, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, o.customer_id,
      'Lead: ' || coalesce(nullif(l.name, ''), nullif(l.email, ''), nullif(l.phone, ''), l.id::text),
      case when nullif(l.email, '') is not null then 'email' when nullif(l.phone, '') is not null then 'sms' else 'manual' end,
      'open', now(), l.created_at,
      jsonb_build_object('createdBy', 'incoming_lead_autonomy', 'source', l.source, 'sourceDetail', l.source_detail)
    from public.leads l
    left join public.opportunities o on o.tenant_id = l.tenant_id and o.lead_id = l.id and o.status = 'open'
    where l.tenant_id = $1 and l.status in ('new', 'contacted', 'qualified')
      and not (l.metadata_json ? 'duplicateOfLeadId')
      and not exists (select 1 from public.communication_threads t where t.tenant_id = l.tenant_id and t.lead_id = l.id)
    order by l.created_at
    limit 200
    `,
    [tenantId],
  );

  const responseCandidates = await query<ResponseCandidate>(
    `
    select l.id as lead_id, l.brand_id, l.name, l.email, l.phone, l.message, l.lead_type,
      details.service_interest, details.appointment_window
    from public.leads l
    left join public.local_service_lead_details details on details.tenant_id = l.tenant_id and details.lead_id = l.id
    where l.tenant_id = $1 and l.status in ('new', 'contacted', 'qualified')
      and not (l.metadata_json ? 'duplicateOfLeadId')
      and l.consent_to_contact = true
      and (nullif(l.email, '') is not null or nullif(l.phone, '') is not null)
      and not exists (
        select 1 from public.leads earlier
        where earlier.tenant_id = l.tenant_id
          and (earlier.created_at, earlier.id) < (l.created_at, l.id)
          and earlier.created_at >= l.created_at - interval '15 minutes'
          and lower(trim(coalesce(earlier.message, ''))) = lower(trim(coalesce(l.message, '')))
          and (
            (l.email is not null and earlier.email is not null and lower(earlier.email) = lower(l.email))
            or (nullif(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), '') is not null
              and right(regexp_replace(coalesce(earlier.phone, ''), '\\D', '', 'g'), 10)
                = right(regexp_replace(l.phone, '\\D', '', 'g'), 10))
          )
      )
      and not exists (select 1 from public.customer_response_stops stop where stop.tenant_id = l.tenant_id and stop.lead_id = l.id and stop.active = true)
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = l.tenant_id and f.lead_id = l.id and f.workflow_type = 'new_lead_response'
      )
    order by case l.priority when 'high' then 0 else 1 end, l.created_at
    limit 200
    `,
    [tenantId],
  );

  let initialResponsesPrepared = 0;
  for (const candidate of responseCandidates?.rows ?? []) {
    const channel = candidate.email ? "email" : "sms";
    const inserted = await query<{ id: string }>(
      `
      insert into public.follow_up_workflows (
        tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
      )
      select $1, $2, $3, 'new_lead_response', $4, 'scheduled', now(), $5, $6::jsonb
      where not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = $1 and f.lead_id = $3 and f.workflow_type = 'new_lead_response'
      )
      returning id
      `,
      [tenantId, candidate.brand_id, candidate.lead_id, channel, buildInitialLeadResponse(candidate), JSON.stringify({
        createdByAgent: "incoming_lead_autonomy",
        liveCustomerSend: true,
        executionAuthority: "workspace_policy",
        stopOnReply: true,
        requiresConsent: true,
        objective: "understand_and_advance_incoming_lead",
      })],
    );
    if (inserted?.rows[0]) initialResponsesPrepared += 1;
  }

  const incomplete = await query(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
      risk_type, confidence_score, metadata_json
    )
    select l.tenant_id, 'ferocity', 'Ferocity', 'incomplete-lead:' || l.id::text,
      'lead.incomplete_contact', 'A lead cannot be contacted',
      coalesce(nullif(l.name, ''), 'An inbound lead') || ' did not provide a usable email or phone number.',
      'medium', 'needs_owner', true, false,
      'Ferocity preserved and scored the request but cannot continue the conversation without contact information.',
      'Find or request a valid contact method.', '/app/lead-command', 'revenue', 100,
      jsonb_build_object('leadId', l.id, 'createdBy', 'incoming_lead_autonomy')
    from public.leads l
    where l.tenant_id = $1 and l.status <> 'spam'
      and nullif(l.email, '') is null and nullif(l.phone, '') is null
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing
    `,
    [tenantId],
  );

  return {
    duplicatesLinked: changed(duplicates),
    customersCreated: changed(customers),
    customersUpdated: changed(customersUpdated),
    opportunitiesCreated: changed(opportunities),
    opportunitiesUpdated: changed(updatedOpportunities),
    threadsCreated: changed(threads),
    initialResponsesPrepared,
    incompleteLeadsEscalated: changed(incomplete),
  };
}
