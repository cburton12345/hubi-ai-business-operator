import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createNativeWorkforcePrincipal,
  invokeBusinessAction,
  type BusinessActionInvocation,
} from "@/lib/business-actions/gateway";
import { listBusinessActionDefinitions } from "@/lib/business-actions/catalog";
import { queryPostgres } from "@/lib/db/postgres";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || request.headers.get("x-ferocity-certification") !== "business-actions") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const certificationPrefix = `business-action-certification:${randomUUID()}`;
  const workspace = await queryPostgres<{
    tenant_id: string;
    brand_id: string;
    lead_id: string;
    customer_id: string;
    job_id: string;
  }>(`
    select t.id as tenant_id,b.id as brand_id,l.id as lead_id,c.id as customer_id,j.id as job_id
    from public.tenants t
    join public.brands b on b.tenant_id=t.id and b.status='active'
    join public.leads l on l.tenant_id=t.id and l.metadata_json->>'certificationKey'='golden-business-loop-v1'
    join public.customers c on c.tenant_id=t.id and c.source_lead_id=l.id
    join public.service_jobs j on j.tenant_id=t.id and j.source_lead_id=l.id
    where t.slug='ferocity-qa-demo'
    order by l.created_at desc limit 1
  `);
  const fixture = workspace?.rows[0];
  if (!fixture) return NextResponse.json({ error: "Run the golden business-loop certification fixture first." }, { status: 409 });

  const principal = createNativeWorkforcePrincipal({
    tenantId: fixture.tenant_id,
    workflowId: randomUUID(),
    runId: randomUUID(),
    departmentKey: "runtime_certification",
  });
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
  const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const certificationTaskKey = `business-action:certification-seed:${certificationPrefix}`;
  const certificationWorkflowKey = `${certificationPrefix}:workflow`;
  const persistedGoalKey = `external:undefined:${certificationWorkflowKey}`;
  const certificationTask = await queryPostgres<{ id: string }>(
    `insert into public.operating_commitments (
       tenant_id,brand_id,commitment_key,description,status,importance,responsible_type,responsible_label,
       due_at,source_type,source_reference,confidence_score,expected_outcome,
       completion_evidence_required,confirmed_at,metadata_json
     ) values (
       $1,$2,$3,'QA-only task before runtime certification.','active','low','ferocity','Ferocity certification',
       $4,'runtime_certification',$5,100,'Verify that task updates persist with audit history.',false,now(),
       '{"qaOnly":true,"noExternalAction":true}'::jsonb
     ) on conflict (tenant_id,commitment_key) do update set
       description=excluded.description,status='active',due_at=excluded.due_at,updated_at=now()
     returning id`,
    [fixture.tenant_id, fixture.brand_id, certificationTaskKey, dueAt, certificationPrefix],
  );
  const certificationTaskId = certificationTask?.rows[0]?.id;
  if (!certificationTaskId) {
    return NextResponse.json({ error: "The QA task fixture could not be prepared." }, { status: 500 });
  }
  const inputs: Record<string, unknown> = {
    getBusinessSummary: {},
    listCustomers: { limit: 10 },
    listJobs: { limit: 10 },
    listInvoices: { limit: 10 },
    getOpenLeads: { limit: 10 },
    getStaleLeads: { olderThanDays: 1, limit: 10 },
    getUnsoldEstimates: { limit: 10 },
    getCustomerHistory: { customerId: fixture.customer_id },
    getScheduleAvailability: { startsAt, endsAt, limit: 10 },
    getJobStatus: { jobId: fixture.job_id },
    createFollowUp: {
      brandId: fixture.brand_id,
      leadId: fixture.lead_id,
      workflowType: "callback",
      channel: "manual",
      dueAt,
      suggestedMessage: "QA-only internal callback certification. Do not contact anyone.",
    },
    updateJob: { jobId: fixture.job_id, summary: "QA-only proposed job update; no mutation should occur." },
    scheduleJob: { jobId: fixture.job_id, startsAt, endsAt, notifyCustomer: false, notifyCrew: false },
    requestApproval: {
      title: "QA-only business action approval",
      summary: "Verify that protected actions enter review instead of executing.",
      targetTable: "service_jobs",
      targetId: fixture.job_id,
      priority: "normal",
    },
    getOutstandingInvoices: { limit: 10 },
    getOpenCommitments: { limit: 10 },
    getMarketplaceProContractorSourcing: { limit: 10 },
    createCommitment: {
      brandId: fixture.brand_id,
      description: "Complete the QA-only business action certification cleanup.",
      responsibleType: "ferocity",
      responsibleLabel: "Ferocity certification",
      dueAt,
      expectedOutcome: "All action records verified and removed.",
      importance: "normal",
      completionEvidenceRequired: true,
    },
    updateCommitment: {
      taskId: certificationTaskId,
      description: "QA-only task updated through the business action layer.",
      status: "blocked",
      evidence: "Synthetic certification evidence; no external action occurred.",
    },
    startWorkflow: {
      workflowKey: certificationWorkflowKey,
      workflowType: "runtime_certification",
      title: "QA-only governed workflow certification",
      desiredOutcome: "Prove that a governed observe-mode workflow is recorded durably and removed after certification.",
      priority: "low",
      authorityMode: "observe",
      targetAt: dueAt,
    },
  };
  const beforeJob = await queryPostgres<{ scheduled_start: string | null }>(
    `select scheduled_start::text from public.service_jobs where tenant_id=$1 and id=$2`,
    [fixture.tenant_id, fixture.job_id]
  );
  const certifiedActions: Array<{ action: string; status: string }> = [];

  try {
    for (const definition of listBusinessActionDefinitions()) {
      const invocation: BusinessActionInvocation = {
        action: definition.key,
        input: inputs[definition.key],
        idempotencyKey: `${certificationPrefix}:${definition.key}`,
        source: "qa_runtime_certification",
      };
      const result = await invokeBusinessAction(principal, invocation);
      if (!result.ok) throw new Error(`${definition.key} failed: ${result.message}`);
      if (definition.mode === "prepare_for_approval" && result.status !== "needs_review") throw new Error(`${definition.key} bypassed required review.`);
      if (definition.mode !== "prepare_for_approval" && result.status !== "completed") throw new Error(`${definition.key} did not complete as expected.`);
      certifiedActions.push({ action: definition.key, status: result.status });
    }

    const afterJob = await queryPostgres<{ scheduled_start: string | null }>(
      `select scheduled_start::text from public.service_jobs where tenant_id=$1 and id=$2`,
      [fixture.tenant_id, fixture.job_id]
    );
    if (beforeJob?.rows[0]?.scheduled_start !== afterJob?.rows[0]?.scheduled_start) throw new Error("Protected scheduling mutated the job before approval.");

    const audit = await queryPostgres<{ capability_key: string; state: string }>(`
      select capability_key,state from public.capability_execution_audits
      where tenant_id=$1 and idempotency_key like $2 order by capability_key
    `, [fixture.tenant_id, `${certificationPrefix}:%`]);
    if ((audit?.rows.length ?? 0) !== listBusinessActionDefinitions().length) {
      throw new Error(`Expected ${listBusinessActionDefinitions().length} audit records; found ${audit?.rows.length ?? 0}.`);
    }
    if (audit?.rows.some((row) => !["completed", "needs_attention"].includes(row.state))) throw new Error("One or more action audits did not finish correctly.");

    const [updatedTask, updateEvent, createdCommitment, startedWorkflow] = await Promise.all([
      queryPostgres<{ status: string; description: string }>(
        `select status,description from public.operating_commitments where tenant_id=$1 and id=$2`,
        [fixture.tenant_id, certificationTaskId],
      ),
      queryPostgres<{ count: number }>(
        `select count(*)::int as count from public.operating_commitment_events
         where tenant_id=$1 and commitment_id=$2 and event_type='external_update'`,
        [fixture.tenant_id, certificationTaskId],
      ),
      queryPostgres<{ count: number }>(
        `select count(*)::int as count from public.operating_commitments
         where tenant_id=$1 and commitment_key=$2`,
        [fixture.tenant_id, `business-action:${certificationPrefix}:createCommitment`],
      ),
      queryPostgres<{ status: string; authority_mode: string }>(
        `select status,authority_mode from public.operating_goals where tenant_id=$1 and goal_key=$2`,
        [fixture.tenant_id, persistedGoalKey],
      ),
    ]);
    if (updatedTask?.rows[0]?.status !== "blocked" || updatedTask.rows[0]?.description !== "QA-only task updated through the business action layer.") {
      throw new Error("The task update did not persist the certified values.");
    }
    if (updateEvent?.rows[0]?.count !== 1) throw new Error("The task update history was not recorded exactly once.");
    if (createdCommitment?.rows[0]?.count !== 1) throw new Error("The task creation was not recorded exactly once.");
    if (startedWorkflow?.rows[0]?.authority_mode !== "observe") throw new Error("The governed workflow was not recorded in observe mode.");

    return NextResponse.json({
      tenantId: fixture.tenant_id,
      certifiedActions,
      auditsVerified: audit?.rows.length ?? 0,
      protectedJobMutationPrevented: true,
      taskPersistenceVerified: true,
      taskHistoryVerified: true,
      governedWorkflowVerified: true,
      externalProviderActionsTriggered: false,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    await queryPostgres(`delete from public.office_manager_action_requests where tenant_id=$1 and idempotency_key like $2`, [fixture.tenant_id, `business-action:${certificationPrefix}:%`]);
    await queryPostgres(`delete from public.follow_up_workflows where tenant_id=$1 and metadata_json->>'source'='qa_runtime_certification'`, [fixture.tenant_id]);
    await queryPostgres(`delete from public.operating_commitments where tenant_id=$1 and commitment_key like $2`, [fixture.tenant_id, `business-action:${certificationPrefix}:%`]);
    await queryPostgres(`delete from public.operating_commitments where tenant_id=$1 and commitment_key=$2`, [fixture.tenant_id, certificationTaskKey]);
    await queryPostgres(`delete from public.operating_goals where tenant_id=$1 and goal_key=$2`, [fixture.tenant_id, persistedGoalKey]);
    await queryPostgres(`delete from public.capability_execution_audits where tenant_id=$1 and idempotency_key like $2`, [fixture.tenant_id, `${certificationPrefix}:%`]);
  }
}
