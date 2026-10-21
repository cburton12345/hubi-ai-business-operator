import { queryPostgres } from "@/lib/db/postgres";

/**
 * Reconciles measurable outcomes back to the private strategy memory. Optional
 * cross-tenant learning only receives coarse counters after an owner opts in.
 */
export async function refreshLifecycleLearning(tenantId: string) {
  await queryPostgres(
    `
    insert into public.lifecycle_strategy_outcomes (
      tenant_id,brand_id,follow_up_workflow_id,strategy_key,segment_key,experiment_variant,
      channel,sequence_step,completed,customer_replied,qualified,booked,won,opted_out,
      attributed_revenue_cents,outcome_json,prepared_at,last_measured_at
    )
    select
      f.tenant_id,f.brand_id,f.id,
      f.metadata_json->>'strategyKey',
      coalesce(f.metadata_json->>'segment','unknown'),
      f.metadata_json->>'experimentVariant',
      f.channel,
      greatest(1,coalesce((f.metadata_json->>'sequenceStep')::int,1)),
      f.status='completed',
      exists(select 1 from public.customer_response_stops s where s.tenant_id=f.tenant_id and s.lead_id=f.lead_id and s.triggered_at>=f.created_at),
      coalesce(l.qualification_status='qualified',false),
      exists(select 1 from public.service_jobs j where j.tenant_id=f.tenant_id and j.source_lead_id=f.lead_id and j.created_at>=f.created_at),
      coalesce(l.status='won',false),
      exists(select 1 from public.messaging_opt_outs o where o.tenant_id=f.tenant_id and o.active=true and o.created_at>=f.created_at and ((f.channel='sms' and lower(o.contact_value)=lower(l.phone)) or (f.channel='email' and lower(o.contact_value)=lower(l.email)))),
      coalesce((
        select sum(greatest(p.amount_cents-p.refunded_amount_cents,0))::int
        from public.service_jobs j
        join public.service_invoices i on i.tenant_id=j.tenant_id and i.job_id=j.id
        join public.service_invoice_payments p on p.tenant_id=i.tenant_id and p.invoice_id=i.id and p.status in ('succeeded','manual','partially_refunded','refunded')
        where j.tenant_id=f.tenant_id and j.source_lead_id=f.lead_id and p.created_at>=f.created_at
      ),0),
      jsonb_build_object('measuredFrom','canonical_business_records'),
      f.created_at,now()
    from public.follow_up_workflows f
    left join public.leads l on l.tenant_id=f.tenant_id and l.id=f.lead_id
    where f.tenant_id=$1 and f.metadata_json ? 'strategyKey'
    on conflict (tenant_id,follow_up_workflow_id) do update set
      completed=excluded.completed,
      customer_replied=excluded.customer_replied,
      qualified=excluded.qualified,
      booked=excluded.booked,
      won=excluded.won,
      opted_out=excluded.opted_out,
      attributed_revenue_cents=excluded.attributed_revenue_cents,
      outcome_json=public.lifecycle_strategy_outcomes.outcome_json || excluded.outcome_json,
      last_measured_at=now(),updated_at=now()
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    with measured as (
      select brand_id,strategy_key,count(*)::int samples,
        count(*) filter (where customer_replied)::int replies,
        count(*) filter (where qualified)::int qualified,
        count(*) filter (where booked)::int booked,
        count(*) filter (where won)::int won,
        count(*) filter (where opted_out)::int opt_outs,
        coalesce(sum(attributed_revenue_cents),0)::int revenue
      from public.lifecycle_strategy_outcomes
      where tenant_id=$1 and prepared_at>=now()-interval '365 days'
      group by brand_id,strategy_key having count(*)>=3
    ), updated as (
      update public.marketing_memory_items memory set
        summary=('Observed ' || measured.samples || ' prepared touches: ' || measured.replies || ' replies, ' || measured.booked || ' bookings, ' || measured.won || ' wins, and ' || measured.opt_outs || ' opt-outs.'),
        score=least(100,greatest(0,round(
          35 + 20.0*measured.replies/greatest(measured.samples,1)
          + 20.0*measured.qualified/greatest(measured.samples,1)
          + 30.0*measured.booked/greatest(measured.samples,1)
          + 40.0*measured.won/greatest(measured.samples,1)
          - 60.0*measured.opt_outs/greatest(measured.samples,1)
        )::int)),
        confidence_score=least(95,45 + measured.samples*3),
        evidence_json=jsonb_build_array(jsonb_build_object('samples',measured.samples,'replies',measured.replies,'qualified',measured.qualified,'booked',measured.booked,'won',measured.won,'optOuts',measured.opt_outs,'revenueCents',measured.revenue)),
        last_observed_at=now(),updated_at=now()
      from measured
      where memory.tenant_id=$1 and memory.brand_id=measured.brand_id
        and memory.memory_type='channel_learning' and memory.title='Follow-up strategy: ' || measured.strategy_key
      returning memory.id
    )
    insert into public.marketing_memory_items (
      tenant_id,brand_id,memory_type,title,summary,score,status,confidence_score,evidence_json,metadata_json,first_observed_at,last_observed_at
    )
    select $1,measured.brand_id,'channel_learning','Follow-up strategy: ' || measured.strategy_key,
      'Observed ' || measured.samples || ' prepared touches: ' || measured.replies || ' replies, ' || measured.booked || ' bookings, ' || measured.won || ' wins, and ' || measured.opt_outs || ' opt-outs.',
      least(100,greatest(0,round(
        35 + 20.0*measured.replies/greatest(measured.samples,1)
        + 20.0*measured.qualified/greatest(measured.samples,1)
        + 30.0*measured.booked/greatest(measured.samples,1)
        + 40.0*measured.won/greatest(measured.samples,1)
        - 60.0*measured.opt_outs/greatest(measured.samples,1)
      )::int)),
      case when measured.samples>=10 then 'learning' else 'needs_more_data' end,
      least(95,45 + measured.samples*3),
      jsonb_build_array(jsonb_build_object('samples',measured.samples,'replies',measured.replies,'qualified',measured.qualified,'booked',measured.booked,'won',measured.won,'optOuts',measured.opt_outs,'revenueCents',measured.revenue)),
      jsonb_build_object('generatedBy','lifecycle_learning','strategyKey',measured.strategy_key,'tenantPrivate',true),now(),now()
    from measured
    where not exists (
      select 1 from public.marketing_memory_items memory where memory.tenant_id=$1
        and memory.brand_id=measured.brand_id and memory.memory_type='channel_learning'
        and memory.title='Follow-up strategy: ' || measured.strategy_key
    )
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    insert into public.cross_tenant_learning_contributions (
      tenant_id,cohort_key,strategy_key,sample_count,reply_count,qualified_count,booked_count,won_count,opt_out_count,revenue_cents,period_start,period_end
    )
    select outcomes.tenant_id,
      lower(regexp_replace(coalesce(nullif(brand.industry,''),nullif(brand.vertical,''),'general'),'[^a-zA-Z0-9]+','_','g')),
      outcomes.strategy_key,count(*)::int,count(*) filter(where outcomes.customer_replied)::int,
      count(*) filter(where outcomes.qualified)::int,count(*) filter(where outcomes.booked)::int,
      count(*) filter(where outcomes.won)::int,count(*) filter(where outcomes.opted_out)::int,
      coalesce(sum(outcomes.attributed_revenue_cents),0),date_trunc('month',now())::date,(date_trunc('month',now())+interval '1 month-1 day')::date
    from public.lifecycle_strategy_outcomes outcomes
    join public.cross_tenant_learning_consents consent on consent.tenant_id=outcomes.tenant_id and consent.status='enabled'
    left join public.brands brand on brand.tenant_id=outcomes.tenant_id and brand.id=outcomes.brand_id
    where outcomes.tenant_id=$1 and outcomes.prepared_at>=date_trunc('month',now())
    group by outcomes.tenant_id,cohort_key,outcomes.strategy_key
    on conflict (tenant_id,cohort_key,strategy_key,period_start,period_end) do update set
      sample_count=excluded.sample_count,reply_count=excluded.reply_count,qualified_count=excluded.qualified_count,
      booked_count=excluded.booked_count,won_count=excluded.won_count,opt_out_count=excluded.opt_out_count,
      revenue_cents=excluded.revenue_cents,updated_at=now()
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    insert into public.aggregate_growth_playbooks (
      cohort_key,strategy_key,contributing_tenants,sample_count,reply_rate,qualified_rate,booked_rate,won_rate,opt_out_rate,
      revenue_per_sample_cents,confidence_score,evidence_window_start,evidence_window_end,status
    )
    select cohort_key,strategy_key,count(distinct tenant_id)::int,sum(sample_count)::int,
      sum(reply_count)::numeric/nullif(sum(sample_count),0),sum(qualified_count)::numeric/nullif(sum(sample_count),0),
      sum(booked_count)::numeric/nullif(sum(sample_count),0),sum(won_count)::numeric/nullif(sum(sample_count),0),
      sum(opt_out_count)::numeric/nullif(sum(sample_count),0),sum(revenue_cents)::numeric/nullif(sum(sample_count),0),
      least(95,50+count(distinct tenant_id)::int*3),min(period_start),max(period_end),'eligible'
    from public.cross_tenant_learning_contributions
    where period_start>=date_trunc('month',now())::date-interval '12 months'
    group by cohort_key,strategy_key
    having count(distinct tenant_id)>=5 and sum(sample_count)>=50
    on conflict (cohort_key,strategy_key,evidence_window_start,evidence_window_end) do update set
      contributing_tenants=excluded.contributing_tenants,sample_count=excluded.sample_count,reply_rate=excluded.reply_rate,
      qualified_rate=excluded.qualified_rate,booked_rate=excluded.booked_rate,won_rate=excluded.won_rate,
      opt_out_rate=excluded.opt_out_rate,revenue_per_sample_cents=excluded.revenue_per_sample_cents,
      confidence_score=excluded.confidence_score,status='eligible',updated_at=now()
    `
  );
}
