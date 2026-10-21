import { buildFinancialPackets } from "@/lib/document-intelligence/financial-packets";
import type { StatementTransaction } from "@/lib/document-intelligence/types";
import { queryPostgresRequired } from "@/lib/db/postgres";

type StatementPacketDbRow = {
  id: string;
  document_id: string;
  original_file_name: string;
  transaction_date: string | null;
  posted_date: string | null;
  description: string;
  merchant_name: string | null;
  amount_cents: number;
  direction: "debit" | "credit";
  balance_cents: number | null;
  suggested_category: string | null;
  is_transfer: boolean;
  transfer_reason: string | null;
  confidence: string;
  status: string;
  allocation_target_label: string | null;
  metadata_json: Record<string, unknown> | null;
};

export type StatementPacketSourceRow = StatementTransaction & {
  id: string;
  documentId: string;
  originalFileName: string;
  status: string;
  allocationTargetLabel: string | null;
};

export type StatementPacketScope = { projectId?: string | null; batchId?: string | null };

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getStatementFinancialPacket(
  tenantId: string,
  year: number,
  scope: StatementPacketScope = {}
) {
  const result = await queryPostgresRequired<StatementPacketDbRow>(`
    select t.id, t.document_id, d.original_file_name, t.transaction_date::text,
      t.posted_date::text, t.description, t.merchant_name, t.amount_cents,
      t.direction, t.balance_cents, t.suggested_category, t.is_transfer,
      t.transfer_reason, t.confidence::text, t.status, t.allocation_target_label,
      t.metadata_json
    from public.document_intelligence_transactions t
    join public.document_intelligence_documents d
      on d.tenant_id=t.tenant_id and d.id=t.document_id
    where t.tenant_id=$1 and d.source_product='ferocity'
      and coalesce(t.transaction_date,t.created_at::date) >= make_date($2::int,1,1)
      and coalesce(t.transaction_date,t.created_at::date) < make_date(($2::int+1),1,1)
      and ($3::uuid is null or exists (
        select 1 from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b
          on b.tenant_id=bi.tenant_id and b.id=bi.batch_id
        where bi.tenant_id=t.tenant_id and bi.document_id=t.document_id and b.project_id=$3::uuid
      ))
      and ($4::uuid is null or exists (
        select 1 from public.document_intelligence_import_batch_items bi
        where bi.tenant_id=t.tenant_id and bi.document_id=t.document_id and bi.batch_id=$4::uuid
      ))
    order by coalesce(t.transaction_date,t.created_at::date),t.document_id,t.position,t.id
  `, [tenantId, year, scope.projectId ?? null, scope.batchId ?? null], "statement-financial-packet");

  const rows: StatementPacketSourceRow[] = result.rows.map((row) => {
    const metadata = row.metadata_json ?? {};
    return {
      id: row.id,
      documentId: row.document_id,
      originalFileName: row.original_file_name,
      status: row.status,
      allocationTargetLabel: row.allocation_target_label,
      sourceKey: row.id,
      transactionDate: row.transaction_date,
      postedDate: row.posted_date,
      description: row.description,
      merchantName: row.merchant_name,
      counterpartyName: stringValue(metadata.counterpartyName),
      counterpartyHandle: stringValue(metadata.counterpartyHandle),
      note: stringValue(metadata.note),
      transactionType: stringValue(metadata.transactionType),
      providerStatus: stringValue(metadata.providerStatus),
      referenceNumber: stringValue(metadata.referenceNumber),
      amountCents: Number(row.amount_cents),
      feeCents: Number(metadata.feeCents ?? 0),
      direction: row.direction,
      balanceCents: row.balance_cents === null ? null : Number(row.balance_cents),
      suggestedCategory: row.suggested_category,
      isTransfer: row.is_transfer,
      transferReason: row.transfer_reason,
      confidence: Number(row.confidence),
    };
  });

  return buildFinancialPackets(rows);
}
