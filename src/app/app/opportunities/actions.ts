"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { createAuthorizedMaintenanceWorkOrder, runMaintenanceOpportunityOrchestration } from "@/lib/maintenance-ops/autonomous-orchestrator";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const updateSchema = z.object({
  opportunityId: z.string().uuid(),
  customerId: z.string().uuid().or(z.literal("")),
  classification: z.enum(["unclassified", "commercial_maintenance", "other_business", "non_opportunity"]),
  workflowStatus: z.enum(["received", "needs_information", "evaluated", "sourcing", "recruiting", "contractor_identified", "contractor_confirmed", "ready_for_authorization", "accepted", "declined", "converted", "closed"]),
  trade: z.string().trim().max(120),
  scope: z.string().trim().max(5000),
  serviceAddress: z.string().trim().max(500),
  city: z.string().trim().max(120),
  state: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/),
  postalCode: z.string().trim().max(10),
  deadlineAt: z.string().trim(),
  customerBudgetCents: z.number().int().nonnegative().nullable(),
  expectedContractorCostCents: z.number().int().nonnegative().nullable(),
  materialsAllowanceCents: z.number().int().nonnegative(),
  additionalCostCents: z.number().int().nonnegative(),
  paymentTermsDays: z.number().int().min(0).max(365).nullable(),
  complexityScore: z.number().int().min(0).max(100).nullable(),
  callbackRiskScore: z.number().int().min(0).max(100).nullable(),
  licensingRequirements: z.string().trim().max(4000),
  insuranceRequirements: z.string().trim().max(4000),
  licensingVerified: z.boolean(),
  insuranceVerified: z.boolean(),
  customerAuthorized: z.boolean(),
  contractorConfirmed: z.boolean(),
});

function cents(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
}

function integer(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isInteger(amount) ? amount : Number.NaN;
}

function stringList(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 100);
}

function insuranceObject(value: string) {
  const entries = stringList(value).map((item) => {
    const [key, ...rest] = item.split(":");
    return [key.trim().slice(0, 80), (rest.join(":").trim() || "required").slice(0, 500)];
  }).filter(([key]) => Boolean(key));
  return Object.fromEntries(entries);
}

export async function updateMaintenanceOpportunityAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = updateSchema.safeParse({
    opportunityId: formData.get("opportunityId"), customerId: String(formData.get("customerId") ?? ""),
    classification: formData.get("classification"), workflowStatus: formData.get("workflowStatus"),
    trade: String(formData.get("trade") ?? ""), scope: String(formData.get("scope") ?? ""),
    serviceAddress: String(formData.get("serviceAddress") ?? ""), city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""), postalCode: String(formData.get("postalCode") ?? ""),
    deadlineAt: String(formData.get("deadlineAt") ?? ""), customerBudgetCents: cents(formData.get("customerBudget")),
    expectedContractorCostCents: cents(formData.get("expectedContractorCost")), materialsAllowanceCents: cents(formData.get("materialsAllowance")) ?? 0,
    additionalCostCents: cents(formData.get("additionalCost")) ?? 0, paymentTermsDays: integer(formData.get("paymentTermsDays")),
    complexityScore: integer(formData.get("complexityScore")), callbackRiskScore: integer(formData.get("callbackRiskScore")),
    licensingRequirements: String(formData.get("licensingRequirements") ?? ""), insuranceRequirements: String(formData.get("insuranceRequirements") ?? ""),
    licensingVerified: formData.get("licensingVerified") === "on", insuranceVerified: formData.get("insuranceVerified") === "on",
    customerAuthorized: formData.get("customerAuthorized") === "on", contractorConfirmed: formData.get("contractorConfirmed") === "on",
  });
  if (!parsed.success) redirect(`/app/opportunities/${String(formData.get("opportunityId") ?? "")}?error=invalid`);
  const tenantId = await getCurrentWorkspaceId();
  const customerId = parsed.data.customerId || null;
  if (customerId) {
    const customer = await queryPostgres(`select 1 from public.customers where tenant_id=$1 and id=$2`, [tenantId, customerId]);
    if (!customer?.rows[0]) redirect(`/app/opportunities/${parsed.data.opportunityId}?error=customer`);
  }
  const result = await queryPostgres(
    `insert into public.maintenance_opportunity_profiles (
       opportunity_id,tenant_id,classification,workflow_status,trade,scope,service_address,city,state,postal_code,deadline_at,
       customer_budget_cents,expected_contractor_cost_cents,materials_allowance_cents,additional_cost_cents,payment_terms_days,
       complexity_score,callback_risk_score,licensing_requirements,insurance_requirements,licensing_verified,insurance_verified,
       customer_authorized,contractor_confirmed,idempotency_key
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21,$22,$23,$24,$25)
     on conflict (opportunity_id) do update set
       classification=excluded.classification,workflow_status=excluded.workflow_status,trade=excluded.trade,scope=excluded.scope,
       service_address=excluded.service_address,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,
       deadline_at=excluded.deadline_at,customer_budget_cents=excluded.customer_budget_cents,
       expected_contractor_cost_cents=excluded.expected_contractor_cost_cents,materials_allowance_cents=excluded.materials_allowance_cents,
       additional_cost_cents=excluded.additional_cost_cents,payment_terms_days=excluded.payment_terms_days,
       complexity_score=excluded.complexity_score,callback_risk_score=excluded.callback_risk_score,
       licensing_requirements=excluded.licensing_requirements,insurance_requirements=excluded.insurance_requirements,
       licensing_verified=excluded.licensing_verified,insurance_verified=excluded.insurance_verified,
       customer_authorized=excluded.customer_authorized,contractor_confirmed=excluded.contractor_confirmed,updated_at=now()`,
    [parsed.data.opportunityId,tenantId,parsed.data.classification,parsed.data.workflowStatus,parsed.data.trade||null,parsed.data.scope||null,
      parsed.data.serviceAddress||null,parsed.data.city||null,parsed.data.state||null,parsed.data.postalCode||null,parsed.data.deadlineAt||null,
      parsed.data.customerBudgetCents,parsed.data.expectedContractorCostCents,parsed.data.materialsAllowanceCents,parsed.data.additionalCostCents,
      parsed.data.paymentTermsDays,parsed.data.complexityScore,parsed.data.callbackRiskScore,JSON.stringify(stringList(parsed.data.licensingRequirements)),
      JSON.stringify(insuranceObject(parsed.data.insuranceRequirements)),parsed.data.licensingVerified,parsed.data.insuranceVerified,
      parsed.data.customerAuthorized,parsed.data.contractorConfirmed,`maintenance-opportunity:${parsed.data.opportunityId}`],
  );
  if (!result) redirect(`/app/opportunities/${parsed.data.opportunityId}?error=save`);
  await queryPostgres(`update public.opportunities set customer_id=$3,value_cents=coalesce($4,value_cents),updated_at=now() where tenant_id=$1 and id=$2`,[tenantId,parsed.data.opportunityId,customerId,parsed.data.customerBudgetCents]);
  revalidatePath("/app/opportunities"); revalidatePath(`/app/opportunities/${parsed.data.opportunityId}`);
  redirect(`/app/opportunities/${parsed.data.opportunityId}?saved=1`);
}

export async function evaluateAndSourceOpportunityAction(formData: FormData) {
  await requirePermission("lead:manage");
  const opportunityId = z.string().uuid().parse(formData.get("opportunityId"));
  const tenantId = await getCurrentWorkspaceId();
  await runMaintenanceOpportunityOrchestration({ tenantId, limit: 100 });
  revalidatePath("/app/opportunities"); revalidatePath(`/app/opportunities/${opportunityId}`);
  redirect(`/app/opportunities/${opportunityId}?evaluated=1`);
}

export async function convertOpportunityToWorkOrderAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const opportunityId = z.string().uuid().parse(formData.get("opportunityId"));
  const tenantId = await getCurrentWorkspaceId();
  const result = await createAuthorizedMaintenanceWorkOrder({ tenantId, opportunityId, authorizedByUserId: actor.userId });
  if (!result.ok) redirect(`/app/opportunities/${opportunityId}?error=conversion`);
  revalidatePath("/app/opportunities"); revalidatePath(`/app/opportunities/${opportunityId}`); revalidatePath("/app/service");
  redirect(result.value.workOrderId ? `/app/opportunities/${opportunityId}?converted=1` : `/app/opportunities/${opportunityId}`);
}
