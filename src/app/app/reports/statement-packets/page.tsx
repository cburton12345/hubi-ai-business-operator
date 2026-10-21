import Link from "next/link";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getStatementFinancialPacket } from "@/lib/reports/statement-financial-packet";
import type { FinancialPacketKind } from "@/lib/document-intelligence/financial-packets";
import { PrintButton } from "./PrintButton";

const packetKinds = ["income", "expense", "transfer", "withdrawal", "refund", "unresolved"] as const;
const packetLabels: Record<FinancialPacketKind, string> = {
  income: "Income candidates",
  expense: "Expense candidates",
  transfer: "Transfers",
  withdrawal: "Cash withdrawals",
  refund: "Refunds and credits",
  unresolved: "Needs classification",
};

function validYear(value?: string) {
  const current = new Date().getFullYear();
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= current + 1 ? parsed : current;
}

function validUuid(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function validKind(value?: string): FinancialPacketKind | "all" {
  return value && packetKinds.includes(value as FinancialPacketKind) ? value as FinancialPacketKind : "all";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function StatementPacketsPage({ searchParams }: { searchParams: Promise<{ year?: string; project?: string; batch?: string; kind?: string }> }) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const year = validYear(params.year);
  const projectId = validUuid(params.project);
  const batchId = validUuid(params.batch);
  const selectedKind = validKind(params.kind);
  const report = await getStatementFinancialPacket(tenantId, year, { projectId, batchId });
  const visibleKinds = selectedKind === "all" ? packetKinds : [selectedKind];
  const scopeQuery = `${projectId ? `&project=${projectId}` : ""}${batchId ? `&batch=${batchId}` : ""}`;

  return <main className="statement-packet-page">
    <style>{`@media print{@page{margin:.5in}.statement-print-hide{display:none!important}.statement-packet-page{padding:0!important}.statement-section{break-before:page}.statement-section:first-of-type{break-before:auto}.statement-table thead{display:table-header-group}.statement-table tr{break-inside:avoid}a{color:#000;text-decoration:none}}.statement-packet-page{max-width:1100px;margin:0 auto;padding:32px}.statement-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.statement-section{margin:28px 0;border-top:2px solid #222;padding-top:14px}.statement-table{width:100%;border-collapse:collapse}.statement-table th,.statement-table td{text-align:left;padding:7px;border-bottom:1px solid #ccc;vertical-align:top}.statement-table .number{text-align:right;white-space:nowrap}.statement-warning{border:2px solid #9a6700;background:#fff8c5;padding:14px}`}</style>
    <header className="statement-header">
      <div><p>Ferocity reconciled statement evidence</p><h1>{year} statement packets</h1><p>{report.totals.sourceRows} unique rows · debits {money(report.totals.debitCents)} · credits {money(report.totals.creditCents)}</p></div>
      <div className="statement-print-hide button-row"><PrintButton /><Link className="mini-button secondary-button" href="/app/reports">Back to reports</Link></div>
    </header>
    <nav className="statement-print-hide button-row" aria-label="Statement packet type">
      <Link className="mini-button secondary-button" href={`/app/reports/statement-packets?year=${year}${scopeQuery}`}>All</Link>
      {packetKinds.map((kind) => <Link className="mini-button secondary-button" key={kind} href={`/app/reports/statement-packets?year=${year}&kind=${kind}${scopeQuery}`}>{packetLabels[kind]}</Link>)}
      <Link className="mini-button secondary-button" href={`/api/reports/statement-packets?year=${year}${scopeQuery}`}>Download reconciled CSV</Link>
    </nav>
    {visibleKinds.map((kind) => {
      const rows = report.packets[kind];
      const subtotal = rows.reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
      return <section className={`statement-section ${kind === "unresolved" && rows.length ? "statement-warning" : ""}`} key={kind}>
        <h2>{packetLabels[kind]}</h2><p>{rows.length} row{rows.length === 1 ? "" : "s"} · {money(subtotal)}</p>
        {rows.length ? <table className="statement-table"><thead><tr><th>Date</th><th>Description / party</th><th>Category</th><th>Property or job</th><th className="number">Amount</th><th>Source</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td>{row.transactionDate ?? row.postedDate ?? "Unknown"}</td><td>{row.counterpartyName ?? row.merchantName ?? row.description}{row.note ? <><br /><small>{row.note}</small></> : null}</td><td>{row.suggestedCategory ?? "Not classified"}<br /><small>{row.status.replaceAll("_", " ")}</small></td><td>{row.allocationTargetLabel ?? "Not assigned"}</td><td className="number">{row.direction === "debit" ? "−" : "+"}{money(Math.abs(row.amountCents))}</td><td><Link href={`/api/expense-documents/${row.documentId}/original`} target="_blank">{row.originalFileName}</Link></td></tr>)}
        </tbody></table> : <p>No rows in this packet.</p>}
      </section>;
    })}
  </main>;
}
