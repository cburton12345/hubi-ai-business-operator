import { queryPostgres } from "@/lib/db/postgres";
/**
 * Publishes only consented, deidentified counters into minimum-size industry
 * cohorts. Raw campaigns, customer records, contacts, creative, and tenant
 * identifiers are never exposed through aggregate_growth_playbooks.
 */
export async function refreshPaidMediaCohortLearning(tenantId: string) {
  await queryPostgres(
    `insert into public.cross_tenant_learning_contributions (
      tenant_id,cohort_key,strategy_key,sample_count,reply_count,qualified_count,booked_count,won_count,opt_out_count,
      revenue_cents,spend_cents,gross_profit_cents,measurement_kind,period_start,period_end,metadata_json
    )
    select connection.tenant_id,
      lower(regexp_replace(coalesce(nullif(brand.industry,''),nullif(brand.vertical,''),'general'),'[^a-zA-Z0-9]+','_','g')),
      'paid_channel:'||snapshot.provider_key,
      count(*)::int,0,coalesce(sum(snapshot.qualified_leads),0)::int,coalesce(sum(snapshot.booked_appointments),0)::int,
      coalesce(sum(snapshot.sold_jobs),0)::int,0,coalesce(sum(snapshot.attributed_revenue_cents),0),
      coalesce(sum(snapshot.spend_cents),0),coalesce(sum(snapshot.attributed_gross_profit_cents),0),'paid_channel',
      date_trunc('month',now())::date,(date_trunc('month',now())+interval '1 month-1 day')::date,
      jsonb_build_object('containsRawCustomerData',false,'deidentified',true,'providerKey',snapshot.provider_key)
    from public.paid_media_performance_snapshots snapshot
    join public.paid_media_connections connection on connection.tenant_id=snapshot.tenant_id and connection.id=snapshot.connection_id
    join public.cross_tenant_learning_consents consent on consent.tenant_id=connection.tenant_id and consent.status='enabled'
    left join public.brands brand on brand.tenant_id=connection.tenant_id and brand.id=connection.brand_id
    where connection.tenant_id=$1 and snapshot.entity_type='account' and snapshot.period_start>=date_trunc('month',now())
      and snapshot.period_start<date_trunc('month',now())+interval '1 month'
    group by connection.tenant_id,cohort_key,snapshot.provider_key
    on conflict (tenant_id,cohort_key,strategy_key,period_start,period_end) do update set
      sample_count=excluded.sample_count,qualified_count=excluded.qualified_count,booked_count=excluded.booked_count,
      won_count=excluded.won_count,revenue_cents=excluded.revenue_cents,spend_cents=excluded.spend_cents,
      gross_profit_cents=excluded.gross_profit_cents,measurement_kind='paid_channel',metadata_json=excluded.metadata_json,updated_at=now()`,
    [tenantId]
  );

  await queryPostgres(
    `insert into public.aggregate_growth_playbooks (
      cohort_key,strategy_key,contributing_tenants,sample_count,reply_rate,qualified_rate,booked_rate,won_rate,opt_out_rate,
      revenue_per_sample_cents,spend_cents,gross_profit_cents,gross_profit_return,cost_per_qualified_lead_cents,
      customer_acquisition_cost_cents,measurement_kind,confidence_score,evidence_window_start,evidence_window_end,status,metadata_json
    )
    select cohort_key,strategy_key,count(distinct tenant_id)::int,sum(sample_count)::int,0,
      sum(qualified_count)::numeric/nullif(sum(sample_count),0),sum(booked_count)::numeric/nullif(sum(sample_count),0),
      sum(won_count)::numeric/nullif(sum(sample_count),0),0,sum(revenue_cents)::numeric/nullif(sum(sample_count),0),
      sum(spend_cents),sum(gross_profit_cents),sum(gross_profit_cents)::numeric/nullif(sum(spend_cents),0),
      sum(spend_cents)::numeric/nullif(sum(qualified_count),0),sum(spend_cents)::numeric/nullif(sum(won_count),0),
      'paid_channel',least(95,50+count(distinct tenant_id)::int*3),min(period_start),max(period_end),'eligible',
      jsonb_build_object('deidentified',true,'containsRawCustomerData',false,'minimumTenantGate',5,'minimumSampleGate',50)
    from public.cross_tenant_learning_contributions
    where measurement_kind='paid_channel' and period_start>=date_trunc('month',now())::date-interval '12 months'
    group by cohort_key,strategy_key
    having count(distinct tenant_id)>=5 and sum(sample_count)>=50
    on conflict (cohort_key,strategy_key,evidence_window_start,evidence_window_end) do update set
      contributing_tenants=excluded.contributing_tenants,sample_count=excluded.sample_count,
      qualified_rate=excluded.qualified_rate,booked_rate=excluded.booked_rate,won_rate=excluded.won_rate,
      revenue_per_sample_cents=excluded.revenue_per_sample_cents,spend_cents=excluded.spend_cents,
      gross_profit_cents=excluded.gross_profit_cents,gross_profit_return=excluded.gross_profit_return,
      cost_per_qualified_lead_cents=excluded.cost_per_qualified_lead_cents,
      customer_acquisition_cost_cents=excluded.customer_acquisition_cost_cents,measurement_kind='paid_channel',
      confidence_score=excluded.confidence_score,status='eligible',metadata_json=excluded.metadata_json,updated_at=now()`
  );
}
