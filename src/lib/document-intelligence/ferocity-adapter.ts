import { queryPostgres, queryPostgresRequired, withPostgresTransaction } from "@/lib/db/postgres";
import type { AllocationSuggestion, AllocationTarget, NormalizedExpenseDocument, ProductExpenseAdapter } from "./types";

type FerocityAssetAllocationRow = {
  id: string;
  name: string;
  asset_type: string;
  serial_number: string | null;
  customer_name: string;
  location_name: string;
  location_address: string;
  location_city: string | null;
  location_state: string | null;
  location_postal_code: string | null;
  parent_asset_id: string | null;
  parent_asset_name: string | null;
};

export function mapFerocityAssetAllocationTarget(row: FerocityAssetAllocationRow): AllocationTarget {
  const normalizedType = row.asset_type.trim().toLowerCase().replaceAll(/[\s-]+/g, "_");
  const targetType = normalizedType === "property" || normalizedType === "rental_property"
    ? "property"
    : normalizedType === "unit" || normalizedType === "rental_unit"
      ? "unit"
      : normalizedType === "vehicle"
        ? "vehicle"
        : "equipment";
  const propertyLabel = targetType === "unit" ? row.parent_asset_name : null;
  const ownerLabel = propertyLabel ?? row.customer_name;
  return {
    type: targetType,
    ref: row.id,
    label: `${ownerLabel} — ${row.name}`,
    aliases: [
      row.name,
      row.customer_name,
      row.location_name,
      row.location_address,
      row.serial_number ?? "",
      row.parent_asset_name ?? ""
    ],
    context: [row.location_name, row.location_address, propertyLabel].filter(Boolean).join(" · ") || null,
    metadata: {
      assetId: row.id,
      assetType: row.asset_type,
      propertyAssetId: targetType === "property" ? row.id : row.parent_asset_id,
      locationName: row.location_name,
      locationAddress: row.location_address,
      locationCity: row.location_city,
      locationState: row.location_state,
      locationPostalCode: row.location_postal_code
    }
  };
}

export async function listFerocityAllocationTargets(workspaceId: string): Promise<AllocationTarget[]> {
  const [jobs, customers, workers, crews, assets] = await Promise.all([
    queryPostgresRequired<{ id: string; title: string; customer_name: string; service_address: string | null }>(`
      select j.id, j.title, c.name as customer_name, j.service_address
      from public.service_jobs j join public.customers c on c.id = j.customer_id
      where j.tenant_id = $1 and j.status not in ('canceled','lost') order by j.updated_at desc limit 100`, [workspaceId]),
    queryPostgresRequired<{ id: string; name: string; address: string }>(`
      select id, name, concat_ws(' ', address_line1, city, state, postal_code) as address
      from public.customers where tenant_id = $1 and status = 'active' order by updated_at desc limit 100`, [workspaceId]),
    queryPostgresRequired<{ id: string; name: string; trade: string | null }>(`
      select id, name, trade from public.operations_workers where tenant_id = $1 and availability_status <> 'inactive' limit 100`, [workspaceId]),
    queryPostgresRequired<{ id: string; name: string }>(`
      select id, name from public.operations_crews where tenant_id = $1 and status = 'active' limit 100`, [workspaceId]),
    queryPostgresRequired<FerocityAssetAllocationRow>(`
      select a.id, a.name, a.asset_type, a.serial_number, c.name as customer_name,
        l.name as location_name, l.city as location_city, l.state as location_state,
        l.postal_code as location_postal_code,
        concat_ws(' ', l.address_line1, l.city, l.state, l.postal_code) as location_address,
        a.parent_asset_id, parent.name as parent_asset_name
      from public.customer_assets a
      join public.customers c on c.id = a.customer_id
      join public.customer_locations l on l.id = a.location_id and l.tenant_id = a.tenant_id
      left join public.customer_assets parent on parent.id = a.parent_asset_id and parent.tenant_id = a.tenant_id
      where a.tenant_id = $1 and a.status = 'active' limit 100`, [workspaceId])
  ]);

  return [
    { type: "unassigned", ref: null, label: "Needs assignment", aliases: ["unassigned", "unknown", "needs review"] },
    ...(jobs?.rows ?? []).map((row) => ({
      type: "job", ref: row.id, label: `${row.title} — ${row.customer_name}`,
      aliases: [row.title, row.customer_name, row.service_address ?? ""],
      context: row.service_address, metadata: { customerName: row.customer_name }
    })),
    ...(customers?.rows ?? []).map((row) => ({
      type: "customer", ref: row.id, label: row.name, aliases: [row.name, row.address], context: row.address
    })),
    ...(workers?.rows ?? []).map((row) => ({
      type: "employee", ref: row.id, label: row.name, aliases: [row.name, row.trade ?? ""], context: row.trade
    })),
    ...(crews?.rows ?? []).map((row) => ({ type: "crew", ref: row.id, label: row.name, aliases: [row.name] })),
    ...(assets?.rows ?? []).map(mapFerocityAssetAllocationTarget),
    { type: "business_overhead", ref: null, label: "Business / general overhead", aliases: ["office", "overhead", "general", "business"] }
  ];
}

export async function postFerocityExpense(input: {
  workspaceId: string;
  documentId: string;
  document: NormalizedExpenseDocument;
  allocations: AllocationSuggestion[];
  status?: "needs_review" | "approved";
}) {
  if (input.document.documentType === "warranty" && input.document.totalCents === null) return null;
  const primary = [...input.allocations].sort((a, b) => b.confidence - a.confidence)[0];
  const jobId = primary?.targetType === "job" ? primary.targetRef : null;
  const customerId = primary?.targetType === "customer" ? primary.targetRef : null;
  const workerId = primary?.targetType === "employee" ? primary.targetRef : null;
  const doc = await queryPostgres<{ original_bucket: string; original_storage_path: string }>(
    `select original_bucket, original_storage_path from public.document_intelligence_documents where tenant_id = $1 and id = $2`,
    [input.workspaceId, input.documentId]
  );
  const source = doc?.rows[0];
  const total = input.document.totalCents ?? 0;
  const tax = input.document.taxCents ?? 0;
  const expense = await queryPostgres<{ id: string }>(`
    insert into public.operations_expenses (
      tenant_id, worker_id, service_job_id, customer_id, vendor, expense_date,
      amount_cents, tax_cents, category, assign_to, receipt_url, ai_summary, status, metadata_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    returning id`, [
      input.workspaceId,
      workerId,
      jobId,
      customerId,
      input.document.vendorName,
      input.document.documentDate,
      Math.max(0, input.document.totalCents === null ? input.document.subtotalCents ?? 0 : total - tax),
      tax,
      input.document.suggestedCategory ?? "uncategorized",
      jobId ? "job" : customerId ? "customer" : "overhead",
      source ? `supabase://${source.original_bucket}/${source.original_storage_path}` : null,
      `Created from document intelligence. ${input.document.reviewReasons.join(" ")}`.trim(),
      input.status ?? "approved",
      JSON.stringify({ documentIntelligenceId: input.documentId, allocations: input.allocations, originalPreserved: true })
    ]);
  return expense?.rows[0]?.id ?? null;
}

export async function postFerocityStatementTransactions(input: {
  workspaceId: string;
  documentId: string;
  transactionIds: string[];
  allocations: AllocationSuggestion[];
  allocationByTransactionId?: Record<string, AllocationSuggestion>;
}) {
  if (!input.transactionIds.length) return [];
  const primary = [...input.allocations].sort((a, b) => b.confidence - a.confidence)[0];
  const jobId = primary?.targetType === "job" ? primary.targetRef : null;
  const customerId = primary?.targetType === "customer" ? primary.targetRef : null;
  const workerId = primary?.targetType === "employee" ? primary.targetRef : null;
  return withPostgresTransaction(async (client) => {
    const sourceResult = await client.query<{ original_bucket: string; original_storage_path: string }>(
      `select original_bucket, original_storage_path from public.document_intelligence_documents
       where tenant_id = $1 and id = $2 for update`, [input.workspaceId, input.documentId]
    );
    const source = sourceResult.rows[0];
    if (!source) throw new Error("Statement source document was not found.");
    const transactionResult = await client.query<{
      id: string; transaction_date: string | null; description: string; merchant_name: string | null;
      amount_cents: number; suggested_category: string | null; status: string; posted_expense_ref: string | null;
      direction: "debit" | "credit"; metadata_json: Record<string, unknown>;
    }>(`select id, transaction_date::text, description, merchant_name, amount_cents, suggested_category, status, posted_expense_ref
          ,direction, metadata_json
        from public.document_intelligence_transactions
        where tenant_id = $1 and document_id = $2 and id = any($3::uuid[])
          and is_transfer = false
        order by position for update`, [input.workspaceId, input.documentId, input.transactionIds]);
    const expenseIds: string[] = [];
    for (const transaction of transactionResult.rows) {
      if (transaction.posted_expense_ref) {
        expenseIds.push(transaction.posted_expense_ref);
        continue;
      }
      const transactionAllocation = input.allocationByTransactionId?.[transaction.id] ?? primary;
      if (!isSupportedAccountingAllocation(transactionAllocation) || !isResolvedAccountingCategory(transaction.suggested_category)) {
        // Preserve unresolved rows for later review. They must not become
        // generic overhead or unclassified income as a side effect of
        // confirming other rows from the same statement.
        continue;
      }
      if (transaction.direction === "credit") {
        await client.query(`update public.document_intelligence_transactions
          set status = 'approved', allocation_target_type = $1, allocation_target_ref = $2,
            allocation_target_label = $3, allocation_confidence = $4, allocation_rationale = $5,
            metadata_json = metadata_json || $6::jsonb, updated_at = now()
          where tenant_id = $7 and id = $8`, [
            transactionAllocation?.targetType ?? "unassigned_income", transactionAllocation?.targetRef ?? null,
            transactionAllocation?.targetLabel ?? "Unassigned deposit", transactionAllocation?.confidence ?? 1,
            transactionAllocation?.rationale ?? "Confirmed during statement review.",
            JSON.stringify(transactionAllocation?.metadata ?? {}), input.workspaceId, transaction.id
          ]);
        continue;
      }
      const transactionJobId = transactionAllocation?.targetType === "job" ? transactionAllocation.targetRef : jobId;
      const transactionCustomerId = transactionAllocation?.targetType === "customer" ? transactionAllocation.targetRef : customerId;
      const transactionWorkerId = transactionAllocation?.targetType === "employee" ? transactionAllocation.targetRef : workerId;
      const expense = await client.query<{ id: string }>(`
        insert into public.operations_expenses (
          tenant_id, worker_id, service_job_id, customer_id, vendor, expense_date,
          amount_cents, tax_cents, category, assign_to, receipt_url, ai_summary, status, metadata_json
        ) values ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,'approved',$12::jsonb)
        returning id`, [
          input.workspaceId, transactionWorkerId, transactionJobId, transactionCustomerId, transaction.merchant_name ?? transaction.description,
          transaction.transaction_date, transaction.amount_cents, transaction.suggested_category ?? "uncategorized",
          transactionJobId ? "job" : transactionCustomerId ? "customer" : "overhead",
          `supabase://${source.original_bucket}/${source.original_storage_path}`,
          `Created from a reviewed statement transaction: ${transaction.description}`,
          JSON.stringify({
            documentIntelligenceId: input.documentId,
            statementTransactionId: transaction.id,
            allocations: transactionAllocation ? [transactionAllocation] : input.allocations,
            originalPreserved: true
          })
        ]);
      const expenseId = expense.rows[0]?.id;
      if (!expenseId) throw new Error("A selected statement charge could not be posted.");
      await client.query(`update public.document_intelligence_transactions
        set status = 'approved', posted_expense_ref = $1, allocation_target_type = $2,
          allocation_target_ref = $3, allocation_target_label = $4, allocation_confidence = $5,
          allocation_rationale = $6, updated_at = now()
        where tenant_id = $7 and id = $8`, [
          expenseId, transactionAllocation?.targetType ?? "business_overhead", transactionAllocation?.targetRef ?? null,
          transactionAllocation?.targetLabel ?? "Business / general overhead", transactionAllocation?.confidence ?? 1,
          transactionAllocation?.rationale ?? "Confirmed during statement review.", input.workspaceId, transaction.id
        ]);
      expenseIds.push(expenseId);
    }
    return expenseIds;
  });
}

export function isSupportedAccountingAllocation(allocation: AllocationSuggestion | null | undefined) {
  const targetType = allocation?.targetType.trim().toLowerCase() ?? "";
  return Boolean(
    targetType
    && targetType !== "unknown"
    && targetType !== "needs_review"
    && !targetType.startsWith("unassigned"),
  );
}

export function isResolvedAccountingCategory(category: string | null | undefined) {
  const value = category?.trim().toLowerCase() ?? "";
  return Boolean(
    value
    && value !== "uncategorized"
    && !value.endsWith("_needs_review")
    && !value.endsWith("_needs_receipt")
    && !value.endsWith("_needs_classification"),
  );
}

export const ferocityExpenseAdapter: ProductExpenseAdapter = {
  productKey: "ferocity",
  listAllocationTargets: ({ workspaceId }) => listFerocityAllocationTargets(workspaceId),
  postApprovedExpense: (input) => postFerocityExpense({ ...input, status: "approved" }),
  postApprovedStatementTransactions: postFerocityStatementTransactions
};
