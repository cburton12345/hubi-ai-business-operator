import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getStatementFinancialPacket } from "@/lib/reports/statement-financial-packet";

function csv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function validUuid(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const url = new URL(request.url);
  const current = new Date().getFullYear();
  const requested = Number(url.searchParams.get("year"));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= current + 1 ? requested : current;
  const report = await getStatementFinancialPacket(tenantId, year, {
    projectId: validUuid(url.searchParams.get("project")),
    batchId: validUuid(url.searchParams.get("batch")),
  });
  const header = ["packet", "transaction_id", "source_document_id", "source_file", "date", "posted_date", "direction", "description", "merchant_or_party", "note", "category", "property_or_job", "status", "amount", "confidence"];
  const rows = Object.values(report.packets).flat().map((row) => [
    row.packetKind, row.id, row.documentId, row.originalFileName, row.transactionDate, row.postedDate,
    row.direction, row.description, row.counterpartyName ?? row.merchantName, row.note,
    row.suggestedCategory, row.allocationTargetLabel, row.status,
    (Math.abs(row.amountCents) / 100).toFixed(2), row.confidence.toFixed(4),
  ]);
  const body = [header, ...rows].map((row) => row.map(csv).join(",")).join("\n");
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="ferocity-statement-packets-${year}.csv"`,
    "Cache-Control": "private, no-store",
  } });
}
