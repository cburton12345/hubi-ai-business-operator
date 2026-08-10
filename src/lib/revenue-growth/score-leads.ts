import { queryPostgres } from "@/lib/db/postgres";

/** Deterministic, explainable first-pass scoring. It never contacts a lead. */
export async function scoreLeadsForTenant(tenantId: string) {
  const scored = await queryPostgres(
    `
    insert into public.revenue_lead_scores (
      tenant_id, brand_id, lead_id, qualification_status, qualification_score, urgency_score,
      estimated_value_cents, recommended_next_action, qualification_reason, disqualification_reason,
      scoring_inputs_json, last_scored_at, updated_at
    )
    select l.tenant_id,l.brand_id,l.id,
      case
        when l.status = 'spam' then 'spam'
        when l.email is null and l.phone is null then 'needs_review'
        when l.qualification_status = 'qualified' or l.priority = 'high'
          or l.lead_type in ('appointment','quote','case_intake') then 'qualified'
        when l.created_at < now() - interval '7 days' and l.status in ('new','contacted') then 'nurture'
        else 'needs_review'
      end,
      least(100, 20
        + case when l.phone is not null then 15 else 0 end
        + case when l.email is not null then 10 else 0 end
        + case when l.consent_to_contact then 10 else 0 end
        + case when l.priority = 'high' then 20 else 0 end
        + case when l.lead_type in ('appointment','quote','case_intake') then 15 else 0 end
        + case when l.message is not null and length(l.message) > 40 then 10 else 0 end),
      least(100, 15
        + case when l.priority = 'high' then 35 else 0 end
        + case when l.created_at > now() - interval '30 minutes' then 30 when l.created_at > now() - interval '4 hours' then 20 else 0 end
        + case when l.status = 'new' then 15 else 0 end
        + case when coalesce(d.urgency, '') in ('emergency','urgent','asap','today') then 20 else 0 end),
      case
        when l.metadata_json ? 'estimatedValueCents' then greatest(0, (l.metadata_json->>'estimatedValueCents')::integer)
        when l.lead_type = 'case_intake' then 750000
        when l.lead_type = 'quote' then 350000
        when l.lead_type = 'appointment' then 250000
        else 150000
      end,
      case
        when l.status = 'spam' then 'Ignore unless manually restored.'
        when l.email is null and l.phone is null then 'Get a usable phone or email before spending sales time.'
        when l.qualification_status = 'qualified' or l.priority = 'high' then 'Contact now and offer a booked appointment.'
        when l.created_at < now() - interval '7 days' and l.status in ('new','contacted') then 'Move to nurture or stale-lead recovery.'
        else 'Review fit, source, service area, and next step.'
      end,
      case
        when l.status = 'spam' then 'Lead is marked spam.'
        when l.email is null and l.phone is null then 'Missing contact information.'
        when l.qualification_status = 'qualified' then 'Already marked qualified.'
        when l.priority = 'high' then 'High-priority lead.'
        else 'Scored from contact info, consent, source, urgency, and lead type.'
      end,
      case when l.status = 'spam' then 'Spam status' else null end,
      jsonb_build_object(
        'source',l.source,'sourceDetail',l.source_detail,'leadType',l.lead_type,'priority',l.priority,
        'hasPhone',l.phone is not null,'hasEmail',l.email is not null,'consentToContact',l.consent_to_contact,
        'serviceInterest',d.service_interest,'location',d.location,'urgency',d.urgency
      ), now(), now()
    from public.leads l
    left join public.local_service_lead_details d on d.tenant_id=l.tenant_id and d.lead_id=l.id
    where l.tenant_id=$1
    on conflict (tenant_id,lead_id) do update set
      brand_id=excluded.brand_id,qualification_status=excluded.qualification_status,
      qualification_score=excluded.qualification_score,urgency_score=excluded.urgency_score,
      estimated_value_cents=excluded.estimated_value_cents,recommended_next_action=excluded.recommended_next_action,
      qualification_reason=excluded.qualification_reason,disqualification_reason=excluded.disqualification_reason,
      scoring_inputs_json=excluded.scoring_inputs_json,last_scored_at=now(),updated_at=now()
    `,
    [tenantId]
  );

  const updated = await queryPostgres(
    `
    update public.leads l set
      qualification_status=case
        when s.qualification_status='qualified' then 'qualified'
        when s.qualification_status='spam' then 'unqualified'
        when s.qualification_status='disqualified' then 'disqualified'
        else 'needs_review' end,
      lead_score=s.qualification_score,
      priority=case when s.urgency_score>=75 then 'high' when s.urgency_score<=25 then 'low' else l.priority end,
      updated_at=now()
    from public.revenue_lead_scores s
    where l.tenant_id=$1 and s.tenant_id=l.tenant_id and s.lead_id=l.id
    `,
    [tenantId]
  );
  return { scored: Number(scored?.rowCount ?? 0), leadsUpdated: Number(updated?.rowCount ?? 0) };
}
