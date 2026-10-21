import Link from "next/link";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { PrintButton } from "./PrintButton";
import { getFinancialWorkpaperReadiness } from "@/lib/document-intelligence/financial-workpaper-readiness";
import { FinancialWorkpaperReadinessNotice } from "@/components/FinancialWorkpaperReadinessNotice";

type Deposit = {
  id: string; transaction_date: string | null; description: string; merchant_name: string | null;
  amount_cents: number; category: string | null; status: string; target_label: string | null;
  state: string | null; counterparty_name: string | null; counterparty_handle: string | null;
  note: string | null; document_id: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function validYear(value?: string) {
  const current = new Date().getFullYear();
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= current + 1 ? parsed : current;
}

function uuidFrom(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export default async function IncomeTaxPrintPage({ searchParams }: { searchParams: Promise<{ year?: string; project?: string; batch?: string }> }) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const year = validYear(params.year);
  const scope = { projectId: uuidFrom(params.project), batchId: uuidFrom(params.batch) };
  const [result, readiness] = await Promise.all([queryPostgres<Deposit>(`
    select t.id, t.transaction_date::text, t.description, t.merchant_name, t.amount_cents,
      t.suggested_category as category, t.status, t.allocation_target_label as target_label,
      nullif(t.metadata_json->>'locationState','') as state,
      nullif(t.metadata_json->>'counterpartyName','') as counterparty_name,
      nullif(t.metadata_json->>'counterpartyHandle','') as counterparty_handle,
      nullif(t.metadata_json->>'note','') as note, t.document_id
    from public.document_intelligence_transactions t
    where t.tenant_id = $1 and t.direction = 'credit' and t.is_transfer = false
      and t.status in ('approved','needs_review')
      and coalesce(t.transaction_date, t.created_at::date) >= make_date($2::int, 1, 1)
      and coalesce(t.transaction_date, t.created_at::date) < make_date(($2::int + 1), 1, 1)
      and ($3::uuid is null or exists (
        select 1 from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        where bi.tenant_id=t.tenant_id and bi.document_id=t.document_id and b.project_id=$3::uuid
      ))
      and ($4::uuid is null or exists (
        select 1 from public.document_intelligence_import_batch_items bi
        where bi.tenant_id=t.tenant_id and bi.document_id=t.document_id and bi.batch_id=$4::uuid
      ))
    order by case when t.status = 'needs_review' then 0 else 1 end,
      coalesce(t.allocation_target_label, ''), t.transaction_date`, [tenantId, year, scope.projectId, scope.batchId]), getFinancialWorkpaperReadiness(tenantId, year, scope)]);
  const rows = result?.rows ?? [];
  const unresolved = rows.filter((row) => row.status === "needs_review" || !row.target_label);
  const approved = rows.filter((row) => row.status === "approved" && row.target_label);
  const groups = new Map<string, Deposit[]>();
  for (const row of approved) {
    const key = `${row.state || "State not identified"}|${row.target_label}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const total = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  return <main className="tax-print-page">
    <style>{`@media print {@page{margin:.55in}.tax-print-hide{display:none!important}.tax-print-page{padding:0!important}.tax-print-group{break-inside:auto}.tax-print-table thead{display:table-header-group}.tax-print-table tr{break-inside:avoid;break-after:auto}a{color:#000;text-decoration:none}} .tax-print-page{max-width:1000px;margin:0 auto;padding:32px}.tax-print-header{display:flex;justify-content:space-between;gap:24px;align-items:start}.tax-print-group{margin:24px 0;border-top:2px solid #222;padding-top:12px}.tax-print-table{width:100%;border-collapse:collapse}.tax-print-table th,.tax-print-table td{text-align:left;padding:7px;border-bottom:1px solid #ccc;vertical-align:top}.tax-print-table .number{text-align:right}.tax-print-warning,.tax-print-readiness{border:2px solid #9a6700;background:#fff8c5;padding:16px;margin:24px 0}.tax-print-readiness-ready{border-color:#1a7f37;background:#dafbe1}`}</style>
    <header className="tax-print-header"><div><p>Ferocity deposit evidence</p><h1>{year} rental money-in packet</h1><p>{rows.length} deposits · {money(total)} total · transfers excluded</p></div><div className="tax-print-hide"><PrintButton /> <Link className="mini-button" href="/app/reports">Back to reports</Link></div></header>
    <FinancialWorkpaperReadinessNotice readiness={readiness} />
    {unresolved.length ? <section className="tax-print-warning"><h2>Needs income classification or property assignment ({unresolved.length})</h2><p>Confirm whether each item is rent, a refundable security deposit, reimbursement, refund, owner contribution, or other receipt. Security deposits are not automatically treated as income.</p><DepositTable rows={unresolved} /></section> : null}
    {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, deposits]) => {
      const [state, property] = key.split("|");
      return <section className="tax-print-group" key={key}><p>{state}</p><h2>{property}</h2><DepositTable rows={deposits} /><p><strong>Property deposits subtotal: {money(deposits.reduce((sum, row) => sum + row.amount_cents, 0))}</strong></p></section>;
    })}
    {!rows.length ? <p>No Cash App or statement deposits were found for {year}.</p> : null}
  </main>;
}

function DepositTable({ rows }: { rows: Deposit[] }) {
  return <table className="tax-print-table"><thead><tr><th>Date</th><th>From</th><th>Note</th><th>Classification</th><th className="number">Amount</th><th>Evidence</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
    <td>{row.transaction_date || "Date unknown"}</td><td>{row.counterparty_name || row.merchant_name || row.description}{row.counterparty_handle ? <><br /><small>{row.counterparty_handle}</small></> : null}</td><td>{row.note || "No note supplied"}</td><td>{row.category || "Needs classification"}</td><td className="number">{money(row.amount_cents)}</td><td><Link href={`/api/expense-documents/${row.document_id}/original`} target="_blank">Statement</Link></td>
  </tr>)}</tbody></table>;
}
