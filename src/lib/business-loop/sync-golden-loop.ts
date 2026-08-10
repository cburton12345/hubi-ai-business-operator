import { queryPostgres } from "@/lib/db/postgres";
import {
  emptyGoldenLoopSnapshot,
  evaluateGoldenLoop,
  type GoldenLoopEvidence,
  type GoldenLoopSnapshot
} from "@/lib/business-loop/golden-loop";
import { prepareProofContentDrafts } from "@/lib/ugc/prepare-proof-content";

export type RawLoopEvidence = {
  run_id: string;
  mode: "observed" | "certification" | "live";
  run_status: string;
  lead_id: string;
  brand_id: string | null;
  customer_id: string | null;
  estimate_id: string | null;
  estimate_status: string | null;
  job_id: string | null;
  job_status: string | null;
  invoice_id: string | null;
  invoice_status: string | null;
  payment_id: string | null;
  margin_record_id: string | null;
  review_id: string | null;
  proof_output_id: string | null;
  growth_recommendation_id: string | null;
  lead_source: string | null;
  lead_status: string;
  qualification_status: string;
  lead_created_at: string;
  qualified_at: string | null;
  estimate_created_at: string | null;
  estimate_updated_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  invoice_created_at: string | null;
  payment_received_at: string | null;
  margin_recorded_at: string | null;
  review_created_at: string | null;
  proof_created_at: string | null;
  growth_created_at: string | null;
};

export type GoldenLoopSyncResult = {
  runsCreated: number;
  runsEvaluated: number;
  loopsCompleted: number;
  handoffGaps: number;
};

function count(result: { rowCount?: number | null } | null) {
  return Number(result?.rowCount ?? 0);
}

function evidence(
  complete: boolean,
  sourceType?: string | null,
  sourceId?: string | null,
  occurredAt?: string | null,
  detail?: string
): GoldenLoopEvidence {
  return { complete, sourceType, sourceId, occurredAt, detail };
}

export function snapshotFromDatabaseRow(row: RawLoopEvidence): GoldenLoopSnapshot {
  const snapshot = emptyGoldenLoopSnapshot();
  snapshot.demand_source_recorded = evidence(Boolean(row.lead_source), "lead", row.lead_id, row.lead_created_at, row.lead_source ?? "Lead source is missing.");
  snapshot.lead_captured = evidence(true, "lead", row.lead_id, row.lead_created_at);
  snapshot.lead_qualified = evidence(
    row.qualification_status === "qualified" || row.lead_status === "qualified" || row.lead_status === "won",
    "lead",
    row.lead_id,
    row.qualified_at
  );
  snapshot.estimate_prepared = evidence(Boolean(row.estimate_id), "service_estimate", row.estimate_id, row.estimate_created_at);
  snapshot.estimate_accepted = evidence(row.estimate_status === "approved", "service_estimate", row.estimate_id, row.estimate_updated_at);
  snapshot.work_scheduled = evidence(
    Boolean(row.job_id) && ["scheduled", "in_progress", "completed"].includes(row.job_status ?? ""),
    "service_job",
    row.job_id,
    row.scheduled_at
  );
  snapshot.work_completed = evidence(row.job_status === "completed", "service_job", row.job_id, row.completed_at);
  snapshot.invoice_issued = evidence(Boolean(row.invoice_id) && row.invoice_status !== "draft", "service_invoice", row.invoice_id, row.invoice_created_at);
  snapshot.payment_received = evidence(Boolean(row.payment_id), "service_invoice_payment", row.payment_id, row.payment_received_at);
  snapshot.margin_recorded = evidence(Boolean(row.margin_record_id), "revenue_attribution_record", row.margin_record_id, row.margin_recorded_at);
  snapshot.review_requested = evidence(Boolean(row.review_id), "review_request_workflow", row.review_id, row.review_created_at);
  snapshot.proof_repurposed = evidence(Boolean(row.proof_output_id), "ugc_content_output", row.proof_output_id, row.proof_created_at);
  snapshot.growth_restarted = evidence(
    Boolean(row.growth_recommendation_id),
    "marketing_campaign_recommendation",
    row.growth_recommendation_id,
    row.growth_created_at
  );
  return snapshot;
}

async function refreshPaymentMargins(tenantId: string) {
  await queryPostgres(
    `
    insert into public.revenue_attribution_records (
      tenant_id, brand_id, lead_id, customer_id, estimate_id, job_id, invoice_id, payment_id,
      entity_type, entity_id, original_source, latest_source, attribution_model, invoiced_cents,
      collected_cents, gross_profit_cents, metadata_json, occurred_at, updated_at
    )
    select
      p.tenant_id, p.brand_id, coalesce(j.source_lead_id, e.source_lead_id), p.customer_id,
      i.estimate_id, i.job_id, i.id, p.id, 'payment', p.id,
      coalesce(nullif(l.source, ''), 'unknown'),
      coalesce(nullif(l.source_detail, ''), nullif(l.source, ''), 'unknown'),
      'first_touch', i.total_cents, p.amount_cents,
      p.amount_cents - coalesce(mat.material_cents, 0) - coalesce(pay.worker_cents, 0),
      jsonb_build_object('createdBy', 'certified_business_loop', 'provider', p.provider),
      coalesce(p.paid_at, p.received_at, p.created_at), now()
    from public.service_invoice_payments p
    join public.service_invoices i on i.tenant_id = p.tenant_id and i.id = p.invoice_id
    left join public.service_jobs j on j.tenant_id = i.tenant_id and j.id = i.job_id
    left join public.service_estimates e on e.tenant_id = i.tenant_id and e.id = i.estimate_id
    left join public.leads l on l.tenant_id = p.tenant_id and l.id = coalesce(j.source_lead_id, e.source_lead_id)
    left join (
      select tenant_id, service_job_id, sum(coalesce(nullif(actual_cost_cents, 0), estimated_cost_cents)) as material_cents
      from public.job_material_list_items where status <> 'cancelled' group by tenant_id, service_job_id
    ) mat on mat.tenant_id = i.tenant_id and mat.service_job_id = i.job_id
    left join (
      select tenant_id, service_job_id, sum(amount_cents) as worker_cents
      from public.operations_worker_payments where status in ('recorded','reviewed') group by tenant_id, service_job_id
    ) pay on pay.tenant_id = i.tenant_id and pay.service_job_id = i.job_id
    where p.tenant_id = $1 and p.status in ('succeeded','manual')
    on conflict (tenant_id, entity_type, entity_id, attribution_model) do update set
      brand_id = excluded.brand_id, lead_id = excluded.lead_id, customer_id = excluded.customer_id,
      estimate_id = excluded.estimate_id, job_id = excluded.job_id, invoice_id = excluded.invoice_id,
      payment_id = excluded.payment_id, invoiced_cents = excluded.invoiced_cents,
      collected_cents = excluded.collected_cents, gross_profit_cents = excluded.gross_profit_cents,
      metadata_json = public.revenue_attribution_records.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [tenantId]
  );
}

async function preparePostJobGrowth(tenantId: string) {
  // Preparing a private capture link is reversible and does not contact the customer.
  await queryPostgres(
    `
    insert into public.ugc_capture_requests (
      tenant_id, brand_id, customer_id, job_id, public_token, request_type, status, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, j.id,
      replace(gen_random_uuid()::text, '-', ''), 'job_proof', 'ready',
      jsonb_build_object(
        'createdBy','certified_business_loop',
        'sendMode','existing_review_and_consent_gates',
        'liveCustomerSend',false
      )
    from public.service_jobs j
    where j.tenant_id = $1 and j.status = 'completed'
      and not exists (
        select 1 from public.ugc_capture_requests r
        where r.tenant_id = j.tenant_id and r.job_id = j.id and r.status <> 'expired'
      )
    `,
    [tenantId]
  );

  // This shared service is also used by the manual Proof action so there is one
  // implementation of consent-aware proof-to-content preparation.
  await prepareProofContentDrafts({ tenantId, limit: 20 });

  await queryPostgres(
    `
    insert into public.marketing_campaign_recommendations (
      tenant_id, brand_id, recommendation_key, title, trigger_reason, primary_goal,
      recommended_channels, recommended_outputs_json, expected_impact, difficulty,
      priority_score, status, source_signals_json, metadata_json, updated_at
    )
    select s.tenant_id, s.brand_id, 'completed_job_proof_machine',
      'Turn completed work into the next customer',
      'Approved customer proof is ready to be repurposed.', 'Create demand from verified completed work.',
      array['facebook','google_business_profile','website','paid_ads'],
      '["Case study","Local post","Social post","Proof-led ad concept"]'::jsonb,
      'Build trust and create the next measurable demand cycle.', 'low', 90, 'needs_review',
      jsonb_build_object('submissionId',s.id,'jobId',s.job_id,'permissionMarketing',s.permission_marketing),
      jsonb_build_object('createdBy','certified_business_loop','livePublishing',false,'liveAdSpend',false), now()
    from public.ugc_submissions s
    where s.tenant_id = $1 and s.status = 'approved' and s.permission_marketing = true and s.brand_id is not null
      and exists (select 1 from public.ugc_content_outputs o where o.tenant_id=s.tenant_id and o.submission_id=s.id and o.status <> 'archived')
    order by s.updated_at desc
    limit 1
    on conflict (tenant_id, brand_id, recommendation_key) do update set
      title = excluded.title, trigger_reason = excluded.trigger_reason,
      recommended_channels = excluded.recommended_channels,
      recommended_outputs_json = excluded.recommended_outputs_json,
      source_signals_json = excluded.source_signals_json,
      metadata_json = public.marketing_campaign_recommendations.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [tenantId]
  );
}

async function loadLoopEvidence(tenantId: string, limit: number) {
  return queryPostgres<RawLoopEvidence>(
    `
    select
      r.id as run_id, r.mode, r.status as run_status, l.id as lead_id, l.brand_id,
      coalesce(e.customer_id, j.customer_id, i.customer_id) as customer_id,
      e.id as estimate_id, e.status as estimate_status, j.id as job_id, j.status as job_status,
      i.id as invoice_id, i.status as invoice_status, p.id as payment_id, margin.id as margin_record_id,
      review.id as review_id, proof.id as proof_output_id, growth.id as growth_recommendation_id,
      nullif(l.source, '') as lead_source, l.status as lead_status, l.qualification_status,
      l.created_at::text as lead_created_at,
      case when l.qualification_status = 'qualified' or l.status in ('qualified','won') then l.updated_at::text end as qualified_at,
      e.created_at::text as estimate_created_at, e.updated_at::text as estimate_updated_at,
      coalesce(j.scheduled_start, visit.scheduled_start)::text as scheduled_at,
      case when j.status = 'completed' then j.updated_at::text else visit.actual_completed_at::text end as completed_at,
      i.created_at::text as invoice_created_at,
      coalesce(p.paid_at, p.received_at, p.created_at)::text as payment_received_at,
      margin.updated_at::text as margin_recorded_at, review.created_at::text as review_created_at,
      proof.created_at::text as proof_created_at, growth.created_at::text as growth_created_at
    from public.business_loop_runs r
    join public.leads l on l.tenant_id = r.tenant_id and l.id = r.lead_id
    left join lateral (
      select x.* from public.service_estimates x
      where x.tenant_id = r.tenant_id and (x.id = r.estimate_id or x.source_lead_id = l.id)
      order by (x.id = r.estimate_id) desc, (x.status = 'approved') desc, x.created_at desc limit 1
    ) e on true
    left join lateral (
      select x.* from public.service_jobs x
      where x.tenant_id = r.tenant_id and (
        x.id = r.job_id or x.source_lead_id = l.id or (e.id is not null and x.estimate_id = e.id)
      ) order by (x.id = r.job_id) desc, (x.status = 'completed') desc, x.created_at desc limit 1
    ) j on true
    left join lateral (
      select v.scheduled_start, v.actual_completed_at from public.service_visits v
      where v.tenant_id = r.tenant_id and v.service_job_id = j.id
      order by (v.status = 'completed') desc, v.created_at desc limit 1
    ) visit on true
    left join lateral (
      select x.* from public.service_invoices x
      where x.tenant_id = r.tenant_id and (
        x.id = r.invoice_id or x.job_id = j.id or (e.id is not null and x.estimate_id = e.id)
      ) order by (x.id = r.invoice_id) desc, (x.status = 'paid') desc, x.created_at desc limit 1
    ) i on true
    left join lateral (
      select x.* from public.service_invoice_payments x
      where x.tenant_id = r.tenant_id and x.invoice_id = i.id and x.status in ('succeeded','manual')
      order by x.received_at desc limit 1
    ) p on true
    left join lateral (
      select x.* from public.revenue_attribution_records x
      where x.tenant_id = r.tenant_id and x.payment_id = p.id and x.gross_profit_cents is not null
      order by x.updated_at desc limit 1
    ) margin on true
    left join lateral (
      select x.* from public.review_request_workflows x
      where x.tenant_id = r.tenant_id and x.status not in ('suppressed','canceled')
        and ((j.id is not null and x.job_id = j.id) or (x.lead_id = l.id) or (i.id is not null and x.metadata_json->>'invoiceId' = i.id::text))
      order by x.created_at desc limit 1
    ) review on true
    left join lateral (
      select o.* from public.ugc_content_outputs o
      join public.ugc_submissions s on s.tenant_id = o.tenant_id and s.id = o.submission_id
      where o.tenant_id = r.tenant_id and o.status <> 'archived'
        and s.status = 'approved' and s.permission_marketing = true
        and ((j.id is not null and s.job_id = j.id) or (e.customer_id is not null and s.customer_id = e.customer_id))
      order by o.created_at desc limit 1
    ) proof on true
    left join lateral (
      select x.* from public.marketing_campaign_recommendations x
      where x.tenant_id = r.tenant_id and (x.brand_id = l.brand_id or x.brand_id is null)
        and x.recommendation_key = 'completed_job_proof_machine'
        and x.status not in ('dismissed','paused')
        and proof.id is not null and x.updated_at >= proof.created_at
      order by x.updated_at desc limit 1
    ) growth on true
    where r.tenant_id = $1 and r.status in ('active','failed','completed')
    order by r.updated_at asc
    limit $2
    `,
    [tenantId, limit]
  );
}

export async function syncGoldenBusinessLoopsForTenant(tenantId: string, limit = 100): Promise<GoldenLoopSyncResult> {
  const created = await queryPostgres(
    `
    insert into public.business_loop_runs (tenant_id, brand_id, lead_id, mode, status, idempotency_key, metadata_json)
    select l.tenant_id, l.brand_id, l.id, 'observed', 'active', 'lead:' || l.id,
      jsonb_build_object('createdBy', 'business_automation_loop', 'source', l.source)
    from public.leads l
    where l.tenant_id = $1 and l.status <> 'spam'
    order by l.created_at desc
    limit $2
    on conflict (tenant_id, idempotency_key) do nothing
    `,
    [tenantId, limit]
  );

  await refreshPaymentMargins(tenantId);
  await preparePostJobGrowth(tenantId);
  const result = await loadLoopEvidence(tenantId, limit);
  if (!result) throw new Error("Golden business loop evidence could not be loaded.");
  const rows = result?.rows ?? [];
  let loopsCompleted = 0;
  let handoffGaps = 0;

  for (const row of rows) {
    const evaluation = evaluateGoldenLoop(snapshotFromDatabaseRow(row));
    if (evaluation.status === "completed") loopsCompleted += 1;
    handoffGaps += evaluation.handoffGaps.length;

    const stagesJson = JSON.stringify(evaluation.stages.map((stage) => ({
      stageKey: stage.key,
      ordinal: stage.ordinal,
      label: stage.label,
      status: stage.status,
      blockedBy: stage.blockedBy,
      handoffGap: stage.handoffGap,
      evidence: stage.evidence
    })));

    await queryPostgres(
      `
      with incoming as (
        select * from jsonb_to_recordset($3::jsonb) as x(
          "stageKey" text, ordinal integer, label text, status text,
          "blockedBy" text, "handoffGap" boolean, evidence jsonb
        )
      )
      insert into public.business_loop_stage_runs (
        tenant_id, loop_run_id, stage_key, ordinal, label, status, idempotency_key,
        blocked_by_stage, handoff_gap, evidence_json, first_observed_at, completed_at, updated_at
      )
      select $1, $2, "stageKey", ordinal, label, status, ($2::uuid)::text || ':' || "stageKey",
        "blockedBy", "handoffGap", evidence,
        case when coalesce((evidence->>'complete')::boolean, false) then now() end,
        case when status = 'completed' then now() end, now()
      from incoming
      on conflict (loop_run_id, stage_key) do update set
        status = case
          when public.business_loop_stage_runs.status = 'dead_lettered' then 'dead_lettered'
          else excluded.status
        end,
        blocked_by_stage = excluded.blocked_by_stage,
        handoff_gap = excluded.handoff_gap,
        evidence_json = excluded.evidence_json,
        first_observed_at = coalesce(public.business_loop_stage_runs.first_observed_at, excluded.first_observed_at),
        completed_at = case
          when excluded.status = 'completed' then coalesce(public.business_loop_stage_runs.completed_at, now())
          else public.business_loop_stage_runs.completed_at
        end,
        updated_at = now()
      `,
      [tenantId, row.run_id, stagesJson]
    );

    await queryPostgres(
      `
      update public.business_loop_runs
      set brand_id = coalesce($3::uuid, brand_id), customer_id = coalesce($4::uuid, customer_id),
          estimate_id = coalesce($5::uuid, estimate_id), job_id = coalesce($6::uuid, job_id),
          invoice_id = coalesce($7::uuid, invoice_id),
          status = case when status = 'paused' then 'paused' else $8 end,
          current_stage = $9, completed_stage_count = $10, handoff_gap_count = $11,
          last_evaluated_at = now(),
          completed_at = case when $8 = 'completed' then coalesce(completed_at, now()) else null end,
          metadata_json = metadata_json || jsonb_build_object('lastEvaluationSource','certified_business_loop'),
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [tenantId, row.run_id, row.brand_id, row.customer_id, row.estimate_id, row.job_id, row.invoice_id,
        evaluation.status, evaluation.currentStage, evaluation.completedStages, evaluation.handoffGaps.length]
    );

    if (row.mode === "certification") {
      await queryPostgres(
        `
        insert into public.business_loop_certifications (
          tenant_id, certification_key, status, loop_run_id, passed_stage_count, failed_stage_count,
          evidence_json, started_at, certified_at, expires_at, updated_at
        ) values ($1, 'golden-business-loop-v1', $2, $3, $4, $5, $6::jsonb, now(),
          case when $2 = 'certified' then now() end,
          case when $2 = 'certified' then now() + interval '90 days' end, now())
        on conflict (tenant_id, certification_key) do update set
          status = excluded.status, loop_run_id = excluded.loop_run_id,
          passed_stage_count = excluded.passed_stage_count, failed_stage_count = excluded.failed_stage_count,
          evidence_json = excluded.evidence_json, certified_at = excluded.certified_at,
          expires_at = excluded.expires_at, updated_at = now()
        `,
        [tenantId, evaluation.status === "completed" ? "certified" : "running", row.run_id,
          evaluation.completedStages, evaluation.handoffGaps.length, JSON.stringify({ stages: evaluation.stages })]
      );
    }
  }

  return { runsCreated: count(created), runsEvaluated: rows.length, loopsCompleted, handoffGaps };
}
