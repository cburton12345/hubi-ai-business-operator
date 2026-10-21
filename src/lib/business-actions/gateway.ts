import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { createOperatingGoal } from "@/lib/operations/goal-engine";
import {
  businessActionCatalog,
  type BusinessActionKey,
} from "@/lib/business-actions/catalog";
import {
  businessActionPrincipalBlockReason,
  type BusinessActionPrincipal,
} from "@/lib/business-actions/principal-policy";

export type { BusinessActionPrincipal } from "@/lib/business-actions/principal-policy";

export type BusinessActionInvocation = {
  action: BusinessActionKey;
  input?: unknown;
  idempotencyKey: string;
  source?: string;
};

const limit = z.coerce.number().int().min(1).max(100).default(25);
const uuid = z.string().uuid();
const listInput = z.object({ limit: limit.optional(), cursor: uuid.optional() }).default({});
const staleLeadInput = z
  .object({
    olderThanDays: z.coerce.number().int().min(1).max(365).default(1),
    limit: limit.optional(),
  })
  .default({ olderThanDays: 1 });
const customerInput = z.object({ customerId: uuid });
const scheduleInput = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  limit: limit.optional(),
});
const jobInput = z.object({ jobId: uuid });
const followUpInput = z
  .object({
    brandId: uuid.nullish(),
    leadId: uuid.nullish(),
    customerId: uuid.nullish(),
    estimateId: uuid.nullish(),
    invoiceId: uuid.nullish(),
    workflowType: z.enum([
      "new_lead_response",
      "stale_lead_recovery",
      "estimate_followup",
      "callback",
      "nurture",
      "invoice_followup",
    ]),
    channel: z.enum(["manual", "sms", "email", "phone"]).default("manual"),
    dueAt: z.string().datetime().nullish(),
    suggestedMessage: z.string().trim().min(1).max(5_000),
  })
  .refine(
    (value) =>
      Boolean(
        value.leadId || value.customerId || value.estimateId || value.invoiceId,
      ),
    {
      message: "A follow-up target is required.",
    },
  );
const jobUpdateInput = z.object({
  jobId: uuid,
  summary: z.string().trim().min(1).max(2_000),
});
const scheduleJobInput = z.object({
  jobId: uuid,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  notifyCustomer: z.boolean().default(true),
  notifyCrew: z.boolean().default(true),
});
const approvalInput = z.object({
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(2_000),
  targetTable: z.string().trim().max(100).optional(),
  targetId: uuid.optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});
const commitmentInput = z.object({
  brandId: uuid.nullish(),
  description: z.string().trim().min(1).max(2_000),
  responsibleType: z.enum([
    "user",
    "employee",
    "vendor",
    "customer",
    "ai",
    "ferocity",
  ]),
  responsibleLabel: z.string().trim().min(1).max(180),
  dueAt: z.string().datetime(),
  expectedOutcome: z.string().trim().max(1_000).nullish(),
  importance: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  relatedEntityType: z.string().trim().max(100).nullish(),
  relatedEntityId: uuid.nullish(),
  completionEvidenceRequired: z.boolean().default(false),
});
const commitmentUpdateInput = z
  .object({
    taskId: uuid,
    description: z.string().trim().min(1).max(2_000).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    importance: z.enum(["low", "normal", "high", "critical"]).optional(),
    responsibleLabel: z.string().trim().min(1).max(180).optional(),
    status: z.enum(["active", "completed", "canceled", "blocked"]).optional(),
    evidence: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "taskId"), {
    message: "At least one task field must be changed.",
  })
  .refine((value) => value.status !== "completed" || Boolean(value.evidence), {
    message: "Completion evidence is required when completing a task.",
    path: ["evidence"],
  });
const workflowInput = z.object({
  workflowKey: z.string().trim().min(1).max(180),
  workflowType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(240),
  desiredOutcome: z.string().trim().min(1).max(2_000),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  authorityMode: z.enum(["observe", "prepare"]).default("prepare"),
  targetAt: z.string().datetime().nullable().optional(),
  relatedEntityType: z.string().trim().max(100).nullable().optional(),
  relatedEntityId: uuid.nullable().optional(),
});

const inputSchemas: Record<BusinessActionKey, z.ZodTypeAny> = {
  getBusinessSummary: z.object({}).default({}),
  listCustomers: listInput,
  listJobs: listInput,
  listInvoices: listInput,
  getOpenLeads: listInput,
  getStaleLeads: staleLeadInput,
  getUnsoldEstimates: listInput,
  getCustomerHistory: customerInput,
  getScheduleAvailability: scheduleInput,
  getJobStatus: jobInput,
  createFollowUp: followUpInput,
  updateJob: jobUpdateInput,
  scheduleJob: scheduleJobInput,
  requestApproval: approvalInput,
  getOutstandingInvoices: listInput,
  getOpenCommitments: listInput,
  createCommitment: commitmentInput,
  updateCommitment: commitmentUpdateInput,
  startWorkflow: workflowInput,
};

function hasScope(principal: BusinessActionPrincipal, required: string) {
  return (
    principal.scopes.includes("*") ||
    principal.scopes.includes("business:*") ||
    principal.scopes.includes(required)
  );
}

export function createNativeWorkforcePrincipal(input: {
  tenantId: string;
  workflowId: string;
  runId: string;
  departmentKey: string;
}): BusinessActionPrincipal {
  return {
    principalId: `native:${input.departmentKey}:${input.workflowId}`,
    principalType: "ferocity_native",
    tenantId: input.tenantId,
    scopes: ["business:*"],
    authorization: { verified: true, source: "native_runtime" },
    metadata: {
      workflowId: input.workflowId,
      runId: input.runId,
      departmentKey: input.departmentKey,
    },
  };
}

async function beginAudit(
  principal: BusinessActionPrincipal,
  invocation: BusinessActionInvocation,
) {
  const definition = businessActionCatalog[invocation.action];
  const result = await queryPostgres<{ id: string; state: string }>(
    `insert into public.capability_execution_audits (
       tenant_id,capability_key,idempotency_key,state,provider_key,authorization_basis,
       initiator_type,requested_by_user_id,consequential,metadata_json
     ) values ($1,$2,$3,'attempted',$4,$5,$6,$7,$8,$9::jsonb)
     on conflict (tenant_id,idempotency_key) do update set updated_at=now()
     returning id,state`,
    [
      principal.tenantId,
      `business_action:${invocation.action}`,
      invocation.idempotencyKey,
      principal.providerKey ?? null,
      definition.mode === "read" ? "system_observation" : "automation_policy",
      principal.principalType === "user"
        ? "human"
        : principal.principalType === "system"
          ? "system"
          : "ai",
      principal.userId ?? null,
      definition.risk === "medium" || definition.risk === "high",
      JSON.stringify({
        action: invocation.action,
        principalId: principal.principalId,
        principalType: principal.principalType,
        source: invocation.source ?? null,
        scope: definition.scope,
        providerNeutral: true,
        ...principal.metadata,
      }),
    ],
  );
  return result?.rows[0] ?? null;
}

async function finishAudit(
  tenantId: string,
  auditId: string | null,
  state: "completed" | "failed" | "blocked" | "needs_attention",
  outcome: Record<string, unknown>,
  error?: string,
) {
  if (!auditId) return;
  await queryPostgres(
    `update public.capability_execution_audits
     set state=$3,outcome_evidence_json=$4::jsonb,last_error=$5,
       completed_at=case when $3='completed' then now() else completed_at end,
       failed_at=case when $3='failed' then now() else failed_at end,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [tenantId, auditId, state, JSON.stringify(outcome), error ?? null],
  );
}

async function prepareActionRequest(input: {
  principal: BusinessActionPrincipal;
  invocation: BusinessActionInvocation;
  actionType: string;
  title: string;
  summary: string;
  targetTable?: string | null;
  targetId?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  detail: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ id: string }>(
    `insert into public.office_manager_action_requests (
       tenant_id,action_type,status,priority,confidence_score,title,summary,recommended_action,
       target_table,target_id,idempotency_key,requires_owner,metadata_json
     ) values ($1,$2,'needs_review',$3,80,$4,$5,$6,$7,$8,$9,true,$10::jsonb)
     on conflict (tenant_id,idempotency_key) do update set updated_at=now()
     returning id`,
    [
      input.principal.tenantId,
      input.actionType,
      input.priority ?? "normal",
      input.title,
      input.summary,
      "Review the proposed change, confirm the target and consequences, then approve or dismiss it.",
      input.targetTable ?? null,
      input.targetId ?? null,
      `business-action:${input.invocation.idempotencyKey}`,
      JSON.stringify({
        source: input.invocation.source ?? "business_action_layer",
        requestedAction: input.invocation.action,
        requestedByPrincipal: input.principal.principalId,
        principalType: input.principal.principalType,
        providerKey: input.principal.providerKey ?? null,
        detail: input.detail,
      }),
    ],
  );
  return result?.rows[0]?.id ?? null;
}

async function executeAction(
  principal: BusinessActionPrincipal,
  invocation: BusinessActionInvocation,
  parsed: Record<string, unknown>,
) {
  const tenantId = principal.tenantId;
  switch (invocation.action) {
    case "getBusinessSummary": {
      const result = await queryPostgres(
        `select t.id,t.name,t.slug,t.account_type as "accountType",t.status,t.plan_key as "planKey",t.updated_at as "updatedAt",
           (select count(*)::int from public.customers c where c.tenant_id=t.id) as "customerCount",
           (select count(*)::int from public.service_jobs j where j.tenant_id=t.id and j.status not in ('completed','canceled')) as "openJobCount",
           (select count(*)::int from public.service_invoices i where i.tenant_id=t.id and i.status in ('sent_manually','partially_paid','overdue')) as "openInvoiceCount",
           (select count(*)::int from public.operating_commitments c where c.tenant_id=t.id and c.status not in ('verified','canceled')) as "openTaskCount"
         from public.tenants t where t.id=$1 and t.status<>'archived' limit 1`,
        [tenantId],
      );
      if (!result) throw new Error("Business summary is temporarily unavailable.");
      return { business: result?.rows[0] ?? null, generatedAt: new Date().toISOString() };
    }
    case "listCustomers": {
      const result = await queryPostgres(
        `select id,name,status,customer_type as "customerType",created_at as "createdAt",updated_at as "updatedAt"
         from public.customers where tenant_id=$1 and ($2::uuid is null or id>$2::uuid)
         order by id asc limit $3`,
        [tenantId, parsed.cursor ?? null, parsed.limit ?? 25],
      );
      if (!result) throw new Error("Customers are temporarily unavailable.");
      const items = result?.rows ?? [];
      return { items, nextCursor: items.length === (parsed.limit ?? 25) ? String((items.at(-1) as { id: string }).id) : null };
    }
    case "listJobs": {
      const result = await queryPostgres(
        `select j.id,j.customer_id as "customerId",c.name as "customerName",j.title,j.status,
           j.scheduled_start as "scheduledStart",j.scheduled_end as "scheduledEnd",j.updated_at as "updatedAt"
         from public.service_jobs j join public.customers c on c.tenant_id=j.tenant_id and c.id=j.customer_id
         where j.tenant_id=$1 and ($2::uuid is null or j.id>$2::uuid) order by j.id asc limit $3`,
        [tenantId, parsed.cursor ?? null, parsed.limit ?? 25],
      );
      if (!result) throw new Error("Jobs are temporarily unavailable.");
      const items = result?.rows ?? [];
      return { items, nextCursor: items.length === (parsed.limit ?? 25) ? String((items.at(-1) as { id: string }).id) : null };
    }
    case "listInvoices": {
      const result = await queryPostgres(
        `select i.id,i.customer_id as "customerId",c.name as "customerName",i.title,i.status,i.total_cents as "totalCents",
           i.amount_paid_cents as "amountPaidCents",greatest(i.total_cents-i.amount_paid_cents-i.write_off_cents,0) as "balanceCents",
           i.due_date as "dueDate",i.updated_at as "updatedAt"
         from public.service_invoices i join public.customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id
         where i.tenant_id=$1 and ($2::uuid is null or i.id>$2::uuid) order by i.id asc limit $3`,
        [tenantId, parsed.cursor ?? null, parsed.limit ?? 25],
      );
      if (!result) throw new Error("Invoices are temporarily unavailable.");
      const items = result?.rows ?? [];
      return { items, nextCursor: items.length === (parsed.limit ?? 25) ? String((items.at(-1) as { id: string }).id) : null };
    }
    case "getOpenLeads": {
      const result = await queryPostgres(
        `select id,name,status,priority,source,created_at as "createdAt",updated_at as "updatedAt"
         from public.leads where tenant_id=$1 and status in ('new','contacted','qualified')
         order by case priority when 'high' then 0 when 'normal' then 1 else 2 end,created_at asc limit $2`,
        [tenantId, parsed.limit ?? 25],
      );
      return { items: result?.rows ?? [] };
    }
    case "getStaleLeads": {
      const result = await queryPostgres(
        `select id,brand_id as "brandId",name,status,priority,source,created_at as "createdAt",updated_at as "updatedAt"
         from public.leads where tenant_id=$1 and status in ('new','contacted','qualified')
           and greatest(created_at,updated_at)<now()-($2::text || ' days')::interval
         order by greatest(created_at,updated_at) asc limit $3`,
        [tenantId, parsed.olderThanDays ?? 1, parsed.limit ?? 25],
      );
      return { items: result?.rows ?? [] };
    }
    case "getUnsoldEstimates": {
      const result = await queryPostgres(
        `select e.id,e.customer_id as "customerId",c.name as "customerName",e.title,e.status,
           e.total_cents as "totalCents",e.valid_until as "validUntil",e.updated_at as "updatedAt"
         from public.service_estimates e join public.customers c on c.tenant_id=e.tenant_id and c.id=e.customer_id
         where e.tenant_id=$1 and e.status in ('draft','sent_manually','expired')
         order by e.updated_at asc limit $2`,
        [tenantId, parsed.limit ?? 25],
      );
      return { items: result?.rows ?? [] };
    }
    case "getCustomerHistory": {
      const customerId = String(parsed.customerId);
      const [customer, jobs, estimates, invoices, followUps] =
        await Promise.all([
          queryPostgres(
            `select id,name,status,customer_type as "customerType",created_at as "createdAt" from public.customers where tenant_id=$1 and id=$2 limit 1`,
            [tenantId, customerId],
          ),
          queryPostgres(
            `select id,title,status,scheduled_start as "scheduledStart",scheduled_end as "scheduledEnd",updated_at as "updatedAt" from public.service_jobs where tenant_id=$1 and customer_id=$2 order by created_at desc limit 50`,
            [tenantId, customerId],
          ),
          queryPostgres(
            `select id,title,status,total_cents as "totalCents",valid_until as "validUntil",updated_at as "updatedAt" from public.service_estimates where tenant_id=$1 and customer_id=$2 order by created_at desc limit 50`,
            [tenantId, customerId],
          ),
          queryPostgres(
            `select id,title,status,total_cents as "totalCents",amount_paid_cents as "amountPaidCents",due_date as "dueDate",updated_at as "updatedAt" from public.service_invoices where tenant_id=$1 and customer_id=$2 order by created_at desc limit 50`,
            [tenantId, customerId],
          ),
          queryPostgres(
            `select id,workflow_type as "workflowType",channel,status,due_at as "dueAt",completed_at as "completedAt" from public.follow_up_workflows where tenant_id=$1 and customer_id=$2 order by created_at desc limit 50`,
            [tenantId, customerId],
          ),
        ]);
      if (!customer || !jobs || !estimates || !invoices || !followUps) {
        throw new Error("Customer history is temporarily unavailable.");
      }
      return {
        customer: customer?.rows[0] ?? null,
        jobs: jobs?.rows ?? [],
        estimates: estimates?.rows ?? [],
        invoices: invoices?.rows ?? [],
        followUps: followUps?.rows ?? [],
      };
    }
    case "getScheduleAvailability": {
      const result = await queryPostgres(
        `select id,title,status,scheduled_start as "startsAt",scheduled_end as "endsAt",priority
         from public.service_visits where tenant_id=$1 and status not in ('completed','canceled','no_show')
           and scheduled_start<$3::timestamptz and coalesce(scheduled_end,scheduled_start+interval '2 hours')>$2::timestamptz
         order by scheduled_start asc limit $4`,
        [tenantId, parsed.startsAt, parsed.endsAt, parsed.limit ?? 100],
      );
      if (!result) throw new Error("Schedule availability is temporarily unavailable.");
      return {
        requestedWindow: { startsAt: parsed.startsAt, endsAt: parsed.endsAt },
        occupiedWindows: result?.rows ?? [],
        note: "Occupied windows are returned; final availability still follows workspace hours, travel, skills, assignments, and conflict rules.",
      };
    }
    case "getJobStatus": {
      const result = await queryPostgres(
        `select j.id,j.title,j.status,j.scheduled_start as "scheduledStart",j.scheduled_end as "scheduledEnd",
           j.ai_next_action as "nextAction",c.id as "customerId",c.name as "customerName",j.updated_at as "updatedAt"
         from public.service_jobs j join public.customers c on c.tenant_id=j.tenant_id and c.id=j.customer_id
         where j.tenant_id=$1 and j.id=$2 limit 1`,
        [tenantId, parsed.jobId],
      );
      if (!result) throw new Error("Job status is temporarily unavailable.");
      return { job: result?.rows[0] ?? null };
    }
    case "createFollowUp": {
      const result = await queryPostgres<{ id: string }>(
        `insert into public.follow_up_workflows (
           tenant_id,brand_id,lead_id,customer_id,estimate_id,invoice_id,workflow_type,channel,status,due_at,ai_suggested_message,metadata_json
         ) select $1,$2,$3,$4,$5,$6,$7,$8,'open',coalesce($9::timestamptz,now()),$10,$11::jsonb
         where not exists (
           select 1 from public.follow_up_workflows f where f.tenant_id=$1
             and f.workflow_type=$7 and f.status in ('open','scheduled')
             and ($3::uuid is null or f.lead_id=$3) and ($4::uuid is null or f.customer_id=$4)
             and ($5::uuid is null or f.estimate_id=$5) and ($6::uuid is null or f.invoice_id=$6)
         ) returning id`,
        [
          tenantId,
          parsed.brandId ?? null,
          parsed.leadId ?? null,
          parsed.customerId ?? null,
          parsed.estimateId ?? null,
          parsed.invoiceId ?? null,
          parsed.workflowType,
          parsed.channel,
          parsed.dueAt ?? null,
          parsed.suggestedMessage,
          JSON.stringify({
            source: invocation.source ?? "business_action_layer",
            requestedByPrincipal: principal.principalId,
            providerNeutral: true,
          }),
        ],
      );
      return {
        followUpId: result?.rows[0]?.id ?? null,
        created: Boolean(result?.rows[0]),
      };
    }
    case "updateJob": {
      const requestId = await prepareActionRequest({
        principal,
        invocation,
        actionType: "update_record",
        title: "Review proposed job update",
        summary: String(parsed.summary),
        targetTable: "service_jobs",
        targetId: String(parsed.jobId),
        priority: "high",
        detail: parsed,
      });
      return { requestId, status: "needs_review" };
    }
    case "scheduleJob": {
      const requestId = await prepareActionRequest({
        principal,
        invocation,
        actionType: "schedule_appointment",
        title: "Review proposed job schedule",
        summary: `Schedule the job for ${String(parsed.startsAt)}.`,
        targetTable: "service_jobs",
        targetId: String(parsed.jobId),
        priority: "high",
        detail: parsed,
      });
      return { requestId, status: "needs_review" };
    }
    case "requestApproval": {
      const requestId = await prepareActionRequest({
        principal,
        invocation,
        actionType: "custom",
        title: String(parsed.title),
        summary: String(parsed.summary),
        targetTable: parsed.targetTable ? String(parsed.targetTable) : null,
        targetId: parsed.targetId ? String(parsed.targetId) : null,
        priority: parsed.priority as "low" | "normal" | "high" | "urgent",
        detail: parsed,
      });
      return { requestId, status: "needs_review" };
    }
    case "getOutstandingInvoices": {
      const result = await queryPostgres(
        `select i.id,i.customer_id as "customerId",c.name as "customerName",i.title,i.status,
           greatest(i.total_cents-i.amount_paid_cents-i.write_off_cents,0) as "balanceCents",i.due_date as "dueDate",i.updated_at as "updatedAt"
         from public.service_invoices i join public.customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id
         where i.tenant_id=$1 and i.status in ('sent_manually','partially_paid','overdue')
           and greatest(i.total_cents-i.amount_paid_cents-i.write_off_cents,0)>0
         order by i.due_date asc nulls first limit $2`,
        [tenantId, parsed.limit ?? 25],
      );
      return { items: result?.rows ?? [] };
    }
    case "getOpenCommitments": {
      const result = await queryPostgres(
        `select id,description,status,importance,responsible_type as "responsibleType",
           responsible_label as "responsibleLabel",due_at as "dueAt",expected_outcome as "expectedOutcome",
           related_entity_type as "relatedEntityType",related_entity_id as "relatedEntityId"
         from public.operating_commitments where tenant_id=$1 and status not in ('verified','canceled')
           and ($2::uuid is null or id>$2::uuid)
         order by id asc limit $3`,
        [tenantId, parsed.cursor ?? null, parsed.limit ?? 25],
      );
      if (!result) throw new Error("Tasks are temporarily unavailable.");
      const items = result?.rows ?? [];
      return { items, nextCursor: items.length === (parsed.limit ?? 25) ? String((items.at(-1) as { id: string }).id) : null };
    }
    case "createCommitment": {
      const result = await queryPostgres<{ id: string }>(
        `insert into public.operating_commitments (
           tenant_id,brand_id,commitment_key,description,status,importance,responsible_type,responsible_label,
           due_at,related_entity_type,related_entity_id,source_type,source_reference,confidence_score,
           expected_outcome,completion_evidence_required,confirmed_at,metadata_json
         ) values ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,'business_action',$11,100,$12,$13,now(),$14::jsonb)
         on conflict (tenant_id,commitment_key) do update set updated_at=now() returning id`,
        [
          tenantId,
          parsed.brandId ?? null,
          `business-action:${invocation.idempotencyKey}`,
          parsed.description,
          parsed.importance,
          parsed.responsibleType,
          parsed.responsibleLabel,
          parsed.dueAt,
          parsed.relatedEntityType ?? null,
          parsed.relatedEntityId ?? null,
          invocation.source ?? principal.principalId,
          parsed.expectedOutcome ?? null,
          parsed.completionEvidenceRequired ?? false,
          JSON.stringify({
            providerNeutral: true,
            requestedByPrincipal: principal.principalId,
          }),
        ],
      );
      if (!result) throw new Error("The task could not be created safely.");
      const commitmentId = result?.rows[0]?.id ?? null;
      if (commitmentId) {
        await queryPostgres(
          `insert into public.operating_commitment_events (tenant_id,commitment_id,event_type,next_status,actor_type,note,evidence_json)
           values ($1,$2,'captured','active',$3,$4,$5::jsonb)`,
          [
            tenantId,
            commitmentId,
            principal.principalType === "user" ? "user" : "ai",
            "Created through the provider-neutral business action layer.",
            JSON.stringify({
              principalId: principal.principalId,
              source: invocation.source ?? null,
            }),
          ],
        );
      }
      return { commitmentId, created: Boolean(commitmentId) };
    }
    case "updateCommitment": {
      const current = await queryPostgres<{ id: string; status: string }>(
        `select id,status from public.operating_commitments where tenant_id=$1 and id=$2 limit 1`,
        [tenantId, parsed.taskId],
      );
      const task = current?.rows[0];
      if (!task) throw new Error("Task was not found in the authorized workspace.");
      const nextStatus = parsed.status ?? task.status;
      const result = await queryPostgres<{ id: string; status: string; updatedAt: string }>(
        `update public.operating_commitments set
           description=coalesce($3,description),due_at=case when $4::boolean then $5::timestamptz else due_at end,
           importance=coalesce($6,importance),responsible_label=coalesce($7,responsible_label),status=$8,
           completion_evidence_json=case when $9::text is null then completion_evidence_json else completion_evidence_json || jsonb_build_object('externalAssistantEvidence',$9::text) end,
           completed_at=case when $8='completed' then coalesce(completed_at,now()) else completed_at end,
           canceled_at=case when $8='canceled' then coalesce(canceled_at,now()) else canceled_at end,updated_at=now()
         where tenant_id=$1 and id=$2 returning id,status,updated_at as "updatedAt"`,
        [tenantId, parsed.taskId, parsed.description ?? null, Object.hasOwn(parsed, "dueAt"), parsed.dueAt ?? null,
          parsed.importance ?? null, parsed.responsibleLabel ?? null, nextStatus, parsed.evidence ?? null],
      );
      await queryPostgres(
        `insert into public.operating_commitment_events (tenant_id,commitment_id,event_type,previous_status,next_status,actor_type,note,evidence_json)
         values ($1,$2,'external_update',$3,$4,'ai',$5,$6::jsonb)`,
        [tenantId, parsed.taskId, task.status, nextStatus, parsed.evidence ?? "Updated by an authorized external assistant.",
          JSON.stringify({ principalId: principal.principalId, providerKey: principal.providerKey ?? null })],
      );
      return { task: result?.rows[0] ?? null };
    }
    case "startWorkflow": {
      const goal = await createOperatingGoal({
        tenantId,
        goalKey: `external:${principal.authorization.grantId}:${String(parsed.workflowKey)}`,
        goalType: String(parsed.workflowType),
        title: String(parsed.title),
        desiredOutcome: String(parsed.desiredOutcome),
        priority: parsed.priority as "low" | "normal" | "high" | "critical",
        authorityMode: parsed.authorityMode as "observe" | "prepare",
        sourceType: "external_assistant",
        externalWorkspaceId: principal.authorization.grantId ?? null,
        externalEntityType: "mcp_credential",
        externalEntityId: principal.principalId,
        relatedEntityType: parsed.relatedEntityType ? String(parsed.relatedEntityType) : null,
        relatedEntityId: parsed.relatedEntityId ? String(parsed.relatedEntityId) : null,
        targetAt: parsed.targetAt ? String(parsed.targetAt) : null,
        constraints: {
          externalAssistant: true,
          approvalPoliciesApply: true,
          noExternalCommunicationWithoutApproval: true,
          noFinancialOrLegalExecutionWithoutApproval: true,
        },
      });
      return { goalId: goal.id, status: goal.status, durable: true };
    }
  }
}

export async function invokeBusinessAction(
  principal: BusinessActionPrincipal,
  invocation: BusinessActionInvocation,
) {
  const definition = businessActionCatalog[invocation.action];
  if (!definition)
    return {
      ok: false as const,
      status: "blocked" as const,
      message: "Unknown business action.",
    };
  const principalBlockReason = businessActionPrincipalBlockReason(
    principal,
    definition,
  );
  if (principalBlockReason)
    return {
      ok: false as const,
      status: "blocked" as const,
      message: principalBlockReason,
    };
  if (!hasScope(principal, definition.scope)) {
    return {
      ok: false as const,
      status: "blocked" as const,
      message: `The principal is not allowed to use ${definition.key}.`,
    };
  }
  const parsed = inputSchemas[invocation.action].safeParse(
    invocation.input ?? {},
  );
  if (!parsed.success) {
    return {
      ok: false as const,
      status: "blocked" as const,
      message: "The business action input is invalid.",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const audit = await beginAudit(principal, invocation);
  if (principal.principalType === "external_agent" && !audit) {
    return {
      ok: false as const,
      status: "failed" as const,
      message: "The external action could not be audited safely.",
    };
  }
  try {
    const data = await executeAction(
      principal,
      invocation,
      parsed.data as Record<string, unknown>,
    );
    const status =
      definition.mode === "prepare_for_approval"
        ? "needs_attention"
        : "completed";
    await finishAudit(principal.tenantId, audit?.id ?? null, status, {
      action: invocation.action,
      mode: definition.mode,
    });
    return {
      ok: true as const,
      status:
        definition.mode === "prepare_for_approval"
          ? ("needs_review" as const)
          : ("completed" as const),
      action: invocation.action,
      data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Business action failed.";
    await finishAudit(
      principal.tenantId,
      audit?.id ?? null,
      "failed",
      { action: invocation.action },
      message,
    );
    return { ok: false as const, status: "failed" as const, message };
  }
}
