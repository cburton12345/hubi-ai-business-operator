import { queryPostgres } from "@/lib/db/postgres";
import { failureDisposition, type GoldenLoopStageKey } from "@/lib/business-loop/golden-loop";

export async function startGoldenLoopCertification(input: { tenantId: string; leadId: string }) {
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.business_loop_runs (
      tenant_id, brand_id, lead_id, mode, status, idempotency_key, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, 'certification', 'active',
      'certification:v1:lead:' || l.id,
      jsonb_build_object('createdBy','certification_request','liveProviderActionsTriggered',false)
    from public.leads l
    where l.tenant_id = $1 and l.id = $2 and l.status <> 'spam'
    on conflict (tenant_id, idempotency_key) do update set
      status = case when public.business_loop_runs.status = 'completed' then 'completed' else 'active' end,
      pause_reason = null, updated_at = now()
    returning id
    `,
    [input.tenantId, input.leadId]
  );
  return result?.rows[0]?.id ?? null;
}

export async function setGoldenLoopPause(input: {
  tenantId: string;
  runId: string;
  paused: boolean;
  reason?: string;
}) {
  const result = await queryPostgres<{ id: string; status: string }>(
    `
    update public.business_loop_runs
    set status = case when $3 then 'paused' else 'active' end,
        pause_reason = case when $3 then coalesce(nullif($4, ''), 'Paused by an authorized operator.') else null end,
        metadata_json = metadata_json || jsonb_build_object(
          case when $3 then 'pausedAt' else 'resumedAt' end, now()
        ),
        updated_at = now()
    where tenant_id = $1 and id = $2 and status not in ('completed','canceled')
    returning id, status
    `,
    [input.tenantId, input.runId, input.paused, input.reason ?? ""]
  );
  return result?.rows[0] ?? null;
}

export async function recordGoldenLoopStageFailure(input: {
  tenantId: string;
  runId: string;
  stageKey: GoldenLoopStageKey;
  message: string;
}) {
  const current = await queryPostgres<{ attempt_count: number; max_attempts: number }>(
    `select attempt_count, max_attempts from public.business_loop_stage_runs
     where tenant_id = $1 and loop_run_id = $2 and stage_key = $3 limit 1`,
    [input.tenantId, input.runId, input.stageKey]
  );
  const row = current?.rows[0];
  if (!row) return null;
  const attempt = Number(row.attempt_count) + 1;
  const disposition = failureDisposition(attempt, Number(row.max_attempts));

  const result = await queryPostgres<{ id: string; status: string; attempt_count: number }>(
    `
    update public.business_loop_stage_runs
    set status = $4,
        attempt_count = $5,
        next_attempt_at = case when $6::integer is null then null else now() + make_interval(secs => $6::integer) end,
        last_error = $7,
        updated_at = now()
    where tenant_id = $1 and loop_run_id = $2 and stage_key = $3
    returning id, status, attempt_count
    `,
    [input.tenantId, input.runId, input.stageKey, disposition.status, attempt, disposition.retryAfterSeconds, input.message.slice(0, 1000)]
  );

  if (disposition.status === "dead_lettered") {
    await queryPostgres(
      `
      update public.business_loop_runs
      set status = 'dead_lettered', current_stage = $3,
          metadata_json = metadata_json || jsonb_build_object('deadLetteredAt',now(),'deadLetterReason',$4::text),
          updated_at = now()
      where tenant_id = $1 and id = $2 and status <> 'completed'
      `,
      [input.tenantId, input.runId, input.stageKey, input.message.slice(0, 1000)]
    );
  }
  return result?.rows[0] ?? null;
}

export async function getGoldenLoopReadiness(tenantId: string) {
  const result = await queryPostgres<{
    active_runs: string;
    completed_runs: string;
    paused_runs: string;
    dead_lettered_runs: string;
    handoff_gaps: string;
    certified: boolean;
    certified_at: string | null;
    certification_expires_at: string | null;
    provider_accounts: unknown;
    action_policies: unknown;
  }>(
    `
    select
      (select count(*) from public.business_loop_runs where tenant_id=$1 and status='active')::text as active_runs,
      (select count(*) from public.business_loop_runs where tenant_id=$1 and status='completed')::text as completed_runs,
      (select count(*) from public.business_loop_runs where tenant_id=$1 and status='paused')::text as paused_runs,
      (select count(*) from public.business_loop_runs where tenant_id=$1 and status='dead_lettered')::text as dead_lettered_runs,
      (select count(*) from public.business_loop_stage_runs where tenant_id=$1 and handoff_gap=true)::text as handoff_gaps,
      coalesce((select status='certified' and expires_at > now() from public.business_loop_certifications
        where tenant_id=$1 and certification_key='golden-business-loop-v1'), false) as certified,
      (select certified_at::text from public.business_loop_certifications
        where tenant_id=$1 and certification_key='golden-business-loop-v1') as certified_at,
      (select expires_at::text from public.business_loop_certifications
        where tenant_id=$1 and certification_key='golden-business-loop-v1') as certification_expires_at,
      coalesce((select jsonb_object_agg(provider_key, jsonb_build_object(
        'status',status,'credentialsStatus',credentials_status,'liveActionsEnabled',live_actions_enabled,
        'ownershipMode',ownership_mode
      )) from public.provider_accounts where tenant_id=$1), '{}'::jsonb) as provider_accounts,
      coalesce((select jsonb_object_agg(action_key, jsonb_build_object(
        'status',status,'providerKey',provider_key,'requiresConsent',requires_consent,
        'requiresHumanApproval',requires_human_approval
      )) from public.live_action_policies where tenant_id=$1), '{}'::jsonb) as action_policies
    `,
    [tenantId]
  );
  const row = result?.rows[0];
  return {
    activeRuns: Number(row?.active_runs ?? 0),
    completedRuns: Number(row?.completed_runs ?? 0),
    pausedRuns: Number(row?.paused_runs ?? 0),
    deadLetteredRuns: Number(row?.dead_lettered_runs ?? 0),
    handoffGaps: Number(row?.handoff_gaps ?? 0),
    certified: row?.certified ?? false,
    certifiedAt: row?.certified_at ?? null,
    certificationExpiresAt: row?.certification_expires_at ?? null,
    providerAccounts: row?.provider_accounts ?? {},
    actionPolicies: row?.action_policies ?? {},
    liveActionsTriggeredByCertification: false
  };
}
