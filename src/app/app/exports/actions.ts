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

const importPreviewSchema = z.object({
  sourceSystem: z.string().trim().min(1).max(80),
  csv: z.string().min(3).max(2_000_000)
});
const importBatchSchema = z.object({ batchId: z.string().uuid() });

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizedHeader(value: string) {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, string> = {
    customer: "name", customer_name: "name", full_name: "name", company_name: "name",
    email_address: "email", phone_number: "phone", street: "address_line1",
    address: "address_line1", zip: "postal_code", zipcode: "postal_code", province: "state"
  };
  return aliases[key] ?? key;
}

function customerValidation(record: Record<string, string>) {
  const errors: string[] = [];
  if (!record.name?.trim()) errors.push("Missing customer name.");
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) errors.push("Invalid email.");
  return errors;
}

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

export async function previewCustomerImportAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = importPreviewSchema.safeParse({
    sourceSystem: formData.get("sourceSystem"),
    csv: formData.get("csv")
  });
  if (!parsed.success) return;
  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2 || rows.length > 5001) return;
  const headers = rows[0].map(normalizedHeader);
  const records = rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
  const tenantId = await getCurrentWorkspaceId();
  const batchResult = await queryPostgres<{ id: string }>(
    `
    insert into public.data_import_batches (
      tenant_id, source_system, entity_type, status, dry_run, mapping_json,
      total_rows, valid_rows, invalid_rows, idempotency_key, created_by_user_id
    ) values ($1, $2, 'customers', 'validating', true, $3::jsonb, $4, 0, 0, $5, $6)
    on conflict (tenant_id, idempotency_key) where idempotency_key is not null
    do update set updated_at = now()
    returning id
    `,
    [
      tenantId, parsed.data.sourceSystem, JSON.stringify({ headers }),
      records.length, `customer-csv:${Buffer.from(parsed.data.csv).toString("base64url").slice(0, 80)}`,
      actor.userId === "admin-token" ? null : actor.userId
    ]
  );
  const batchId = batchResult?.rows[0]?.id;
  if (!batchId) return;
  await queryPostgres("delete from public.data_import_rows where tenant_id = $1 and batch_id = $2 and validation_status <> 'applied'", [tenantId, batchId]);
  let valid = 0;
  let invalid = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const errors = customerValidation(record);
    if (errors.length) invalid += 1;
    else valid += 1;
    await queryPostgres(
      `
      insert into public.data_import_rows (
        tenant_id, batch_id, row_number, source_key, source_json, normalized_json,
        validation_status, validation_errors_json
      ) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb)
      on conflict (batch_id, row_number)
      do update set source_json = excluded.source_json, normalized_json = excluded.normalized_json,
        validation_status = excluded.validation_status, validation_errors_json = excluded.validation_errors_json,
        updated_at = now()
      `,
      [
        tenantId, batchId, index + 2, record.email || record.phone || null,
        JSON.stringify(record), JSON.stringify(record), errors.length ? "invalid" : "valid", JSON.stringify(errors)
      ]
    );
  }
  await queryPostgres(
    `
    update public.data_import_batches
    set status = case when $4 > 0 then 'needs_mapping' else 'ready' end,
      valid_rows = $3, invalid_rows = $4,
      validation_summary_json = jsonb_build_object('headers', $5::jsonb, 'message',
        case when $4 > 0 then 'Fix invalid rows before applying.' else 'Dry run passed. Review before applying.' end),
      updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, batchId, valid, invalid, JSON.stringify(headers)]
  );
  revalidatePath("/app/exports");
}

export async function applyCustomerImportAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = importBatchSchema.safeParse({ batchId: formData.get("batchId") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const batchResult = await queryPostgres<{ status: string; entity_type: string }>(
    "select status, entity_type from public.data_import_batches where tenant_id = $1 and id = $2 for update",
    [tenantId, parsed.data.batchId]
  );
  const batch = batchResult?.rows[0];
  if (!batch || batch.status !== "ready" || batch.entity_type !== "customers") return;
  await queryPostgres("update public.data_import_batches set status = 'applying', dry_run = false, updated_at = now() where tenant_id = $1 and id = $2", [tenantId, parsed.data.batchId]);

  const rowsResult = await queryPostgres<{ id: string; normalized_json: Record<string, string> }>(
    "select id, normalized_json from public.data_import_rows where tenant_id = $1 and batch_id = $2 and validation_status = 'valid' order by row_number",
    [tenantId, parsed.data.batchId]
  );
  let applied = 0;
  let failed = 0;
  for (const row of rowsResult?.rows ?? []) {
    const record = row.normalized_json;
    try {
      const created = await queryPostgres<{ id: string }>(
        `
        insert into public.customers (
          tenant_id, name, email, phone, address_line1, address_line2, city, state, postal_code,
          customer_type, status, notes
        )
        select $1,$2,$3,$4,$5,$6,$7,$8,$9,'other','active',$10
        where not exists (
          select 1 from public.customers c where c.tenant_id = $1 and (
            ($3::text is not null and lower(c.email) = lower($3)) or
            ($4::text is not null and regexp_replace(c.phone, '\\D', '', 'g') = regexp_replace($4, '\\D', '', 'g'))
          )
        )
        returning id
        `,
        [
          tenantId, record.name, record.email || null, record.phone || null,
          record.address_line1 || null, record.address_line2 || null, record.city || null,
          record.state || null, record.postal_code || null, record.notes || null
        ]
      );
      const createdId = created?.rows[0]?.id;
      await queryPostgres(
        `update public.data_import_rows set validation_status = $3,
          created_record_type = case when $3 = 'applied' then 'customer' else null end,
          created_record_id = $4, updated_at = now()
         where tenant_id = $1 and id = $2`,
        [tenantId, row.id, createdId ? "applied" : "duplicate", createdId ?? null]
      );
      if (createdId) applied += 1;
    } catch {
      failed += 1;
      await queryPostgres(
        "update public.data_import_rows set validation_status = 'failed', validation_errors_json = '[\"Database insert failed.\"]'::jsonb, updated_at = now() where tenant_id = $1 and id = $2",
        [tenantId, row.id]
      );
    }
  }
  await queryPostgres(
    `
    update public.data_import_batches
    set status = case when $4 > 0 then 'partial' else 'completed' end,
      applied_rows = $3, applied_at = now(), updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, parsed.data.batchId, applied, failed]
  );
  revalidatePath("/app/exports");
}

export async function rollbackCustomerImportAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = importBatchSchema.safeParse({ batchId: formData.get("batchId") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with safe_rows as (
      select r.id as row_id, r.created_record_id as customer_id
      from public.data_import_rows r
      where r.tenant_id = $1 and r.batch_id = $2 and r.validation_status = 'applied'
        and r.created_record_type = 'customer'
        and not exists (select 1 from public.service_estimates e where e.tenant_id = $1 and e.customer_id = r.created_record_id)
        and not exists (select 1 from public.service_jobs j where j.tenant_id = $1 and j.customer_id = r.created_record_id)
        and not exists (select 1 from public.service_invoices i where i.tenant_id = $1 and i.customer_id = r.created_record_id)
    ),
    deleted as (
      delete from public.customers c using safe_rows s
      where c.tenant_id = $1 and c.id = s.customer_id
      returning c.id
    )
    update public.data_import_rows r
    set validation_status = 'rolled_back', updated_at = now()
    from safe_rows s
    where r.id = s.row_id and s.customer_id in (select id from deleted)
    `,
    [tenantId, parsed.data.batchId]
  );
  await queryPostgres(
    `
    update public.data_import_batches b
    set status = case
      when exists (select 1 from public.data_import_rows r where r.batch_id = b.id and r.validation_status = 'applied')
        then 'partial' else 'rolled_back' end,
      rolled_back_at = now(), updated_at = now()
    where b.tenant_id = $1 and b.id = $2 and b.status in ('completed','partial')
    `,
    [tenantId, parsed.data.batchId]
  );
  revalidatePath("/app/exports");
}
