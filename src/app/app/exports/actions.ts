"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { requirePermission } from "@/lib/auth/require-permission";

const schema = z.object({
  draftId: z.string().min(1)
});

function exportTypeForDraft(contentType: string) {
  if (contentType === "google_ad") return "ad_copy";
  if (contentType === "facebook_post" || contentType === "gbp_post") return "social_post";
  if (contentType === "email" || contentType === "sms") return "lead_followup";
  if (contentType === "blog" || contentType === "landing_page") return "seo_brief";
  return "copy_package";
}

export async function createExportFromDraftAction(formData: FormData) {
  const parsed = schema.safeParse({ draftId: formData.get("draftId") });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const draftResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string;
    content_type: string;
    title: string;
    body: string;
    risk_level: string;
  }>(
    `
    select id, tenant_id, brand_id, content_type, title, body, risk_level
    from public.ai_drafts
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, parsed.data.draftId]
  );
  const draft = draftResult?.rows[0];
  if (!draft) return;

  await queryPostgres(
    `
    insert into public.content_exports (
      tenant_id,
      brand_id,
      draft_id,
      export_type,
      title,
      body,
      checklist_json,
      created_by_user_id
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `,
    [
      draft.tenant_id,
      draft.brand_id,
      draft.id,
      exportTypeForDraft(draft.content_type),
      draft.title,
      draft.body,
      JSON.stringify([
        "Review for brand accuracy",
        "Confirm offers, pricing, licensing, and claims before use",
        "Publish or send manually only"
      ]),
      session?.userId ?? null
    ]
  );

  revalidatePath("/app/exports");
  revalidatePath("/app/review");
}

async function getRows(tableName: string, workspaceId: string) {
  const result = await queryPostgres<Record<string, unknown>>(
    `
    select to_jsonb(source.*) as record
    from (
      select *
      from public.${tableName}
      where tenant_id = $1
      order by created_at desc
      limit 5000
    ) source
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => row.record);
}

export async function createWorkspaceDataExportAction() {
  const actor = await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();

  const [
    brands,
    brandServices,
    brandLocations,
    brandOffers,
    forms,
    leads,
    aiTasks,
    aiDrafts,
    recommendations,
    approvals,
    contentExports,
    customers,
    serviceEstimates,
    serviceJobs,
    serviceInvoices
  ] = await Promise.all([
    getRows("brands", workspaceId),
    getRows("brand_services", workspaceId),
    getRows("brand_locations", workspaceId),
    getRows("brand_offers", workspaceId),
    getRows("forms", workspaceId),
    getRows("leads", workspaceId),
    getRows("ai_tasks", workspaceId),
    getRows("ai_drafts", workspaceId),
    getRows("recommendations", workspaceId),
    getRows("approvals", workspaceId),
    getRows("content_exports", workspaceId),
    getRows("customers", workspaceId),
    getRows("service_estimates", workspaceId),
    getRows("service_jobs", workspaceId),
    getRows("service_invoices", workspaceId)
  ]);

  const packageJson = {
    generatedAt: new Date().toISOString(),
    workspaceId,
    exportVersion: 1,
    retention: "Manual JSON package retained in the workspace database until archived.",
    counts: {
      brands: brands.length,
      brandServices: brandServices.length,
      brandLocations: brandLocations.length,
      brandOffers: brandOffers.length,
      forms: forms.length,
      leads: leads.length,
      aiTasks: aiTasks.length,
      aiDrafts: aiDrafts.length,
      recommendations: recommendations.length,
      approvals: approvals.length,
      contentExports: contentExports.length,
      customers: customers.length,
      serviceEstimates: serviceEstimates.length,
      serviceJobs: serviceJobs.length,
      serviceInvoices: serviceInvoices.length
    },
    data: {
      brands,
      brandServices,
      brandLocations,
      brandOffers,
      forms,
      leads,
      aiTasks,
      aiDrafts,
      recommendations,
      approvals,
      contentExports,
      customers,
      serviceEstimates,
      serviceJobs,
      serviceInvoices
    }
  };

  await queryPostgres(
    `
    insert into public.workspace_data_exports (
      tenant_id,
      status,
      package_json,
      requested_by_user_id,
      completed_at,
      expires_at
    )
    values ($1, 'ready', $2::jsonb, $3, now(), now() + interval '30 days')
    `,
    [workspaceId, JSON.stringify(packageJson), actor.userId === "admin-token" ? null : actor.userId]
  );

  revalidatePath("/app/exports");
}
