import Link from "next/link";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { listExpenseTaxPacketRows, type ExpenseTaxPacketRow } from "@/lib/reports/expense-tax-packet";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getFinancialWorkpaperReadiness } from "@/lib/document-intelligence/financial-workpaper-readiness";
import { FinancialWorkpaperReadinessNotice } from "@/components/FinancialWorkpaperReadinessNotice";
import { PrintButton } from "./PrintButton";

type ExpenseRow = ExpenseTaxPacketRow;

type Assignment = { state: string; label: string; targetType: string; location: string };

function yearFrom(value?: string) {
  const current = new Date().getFullYear();
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= current + 1 ? parsed : current;
}

function uuidFrom(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function assignmentFor(metadata: Record<string, unknown>): Assignment | null {
  const allocations = Array.isArray(metadata.allocations) ? metadata.allocations : [];
  for (const value of allocations) {
    if (!value || typeof value !== "object") continue;
    const allocation = value as Record<string, unknown>;
    if (allocation.targetType !== "property" && allocation.targetType !== "unit") continue;
    const detail = allocation.metadata && typeof allocation.metadata === "object"
      ? allocation.metadata as Record<string, unknown>
      : {};
    return {
      state: typeof detail.locationState === "string" && detail.locationState.trim() ? detail.locationState.trim().toUpperCase() : "State not identified",
      label: typeof allocation.targetLabel === "string" && allocation.targetLabel.trim() ? allocation.targetLabel.trim() : "Property name unavailable",
      targetType: String(allocation.targetType),
      location: [detail.locationAddress, detail.locationCity, detail.locationState, detail.locationPostalCode]
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .filter((item, index, all) => all.indexOf(item) === index)
        .join(" · ")
    };
  }
  return null;
}

export default async function ExpenseTaxPrintPage({ searchParams }: { searchParams: Promise<{ year?: string; project?: string; batch?: string }> }) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const year = yearFrom(params.year);
  const scope = { projectId: uuidFrom(params.project), batchId: uuidFrom(params.batch) };
  const [all, settings, readiness] = await Promise.all([
    listExpenseTaxPacketRows(tenantId, year, scope),
    queryPostgres<{ timezone: string }>(`select timezone from public.workspace_settings where tenant_id = $1 limit 1`, [tenantId]),
    getFinancialWorkpaperReadiness(tenantId, year, scope),
  ]);
  const grouped = new Map<string, { assignment: Assignment; expenses: ExpenseRow[] }>();
  const unresolved: ExpenseRow[] = [];
  for (const expense of all) {
    const assignment = assignmentFor(expense.metadata_json ?? {});
    if (!assignment || expense.review_status === "needs_review") {
      unresolved.push(expense);
      continue;
    }
    const key = `${assignment.state}|${assignment.label}`;
    const group = grouped.get(key) ?? { assignment, expenses: [] };
    group.expenses.push(expense);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort((a, b) => `${a.assignment.state}|${a.assignment.label}`.localeCompare(`${b.assignment.state}|${b.assignment.label}`));
  const grandTotal = all.reduce((sum, item) => sum + item.amount_cents + item.tax_cents, 0);
  const timezone = settings?.rows[0]?.timezone ?? "America/Los_Angeles";
  const generatedDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: timezone }).format(new Date());

  return <main className="tax-print-page">
    <style>{`@media print {@page{margin:.55in}.tax-print-hide{display:none!important}.tax-print-page{padding:0!important}.tax-print-group{break-inside:auto}.tax-print-table thead{display:table-header-group}.tax-print-table tr{break-inside:avoid;break-after:auto}a{color:#000;text-decoration:none}} .tax-print-page{max-width:1000px;margin:0 auto;padding:32px}.tax-print-header{display:flex;justify-content:space-between;gap:24px;align-items:start}.tax-print-group{margin:24px 0;border-top:2px solid #222;padding-top:12px}.tax-print-table{width:100%;border-collapse:collapse}.tax-print-table th,.tax-print-table td{text-align:left;padding:7px;border-bottom:1px solid #ccc}.tax-print-table .number{text-align:right}.tax-print-warning,.tax-print-readiness{border:2px solid #9a6700;background:#fff8c5;padding:16px;margin:24px 0}.tax-print-readiness-ready{border-color:#1a7f37;background:#dafbe1}`}</style>
    <header className="tax-print-header">
      <div><p>Ferocity expense evidence</p><h1>{year} rental-property tax packet</h1><p>{all.length} expense candidates · {money(grandTotal)} total · generated {generatedDate} ({timezone})</p></div>
      <div className="tax-print-hide"><PrintButton /> <Link className="mini-button" href="/app/reports">Back to reports</Link></div>
    </header>
    <FinancialWorkpaperReadinessNotice readiness={readiness} />
    {unresolved.length ? <section className="tax-print-warning">
      <h2>Needs property assignment ({unresolved.length})</h2>
      <p>These items are preserved and printable, but they still need review or a confirmed property/unit. This is a draft evidence packet until they are resolved.</p>
      <ExpenseTable expenses={unresolved} showOriginal />
    </section> : null}
    {groups.map((group) => <section className="tax-print-group" key={`${group.assignment.state}:${group.assignment.label}`}>
      <p>{group.assignment.state} · {group.assignment.targetType}</p>
      <h2>{group.assignment.label}</h2>
      {group.assignment.location ? <p>{group.assignment.location}</p> : null}
      <ExpenseTable expenses={group.expenses} showOriginal />
      <p><strong>Property subtotal: {money(group.expenses.reduce((sum, item) => sum + item.amount_cents + item.tax_cents, 0))}</strong></p>
    </section>)}
    {!all.length ? <p>No expense evidence was found for {year}.</p> : null}
  </main>;
}

function ExpenseTable({ expenses, showOriginal }: { expenses: ExpenseRow[]; showOriginal: boolean }) {
  return <table className="tax-print-table"><thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th className="number">Amount</th><th className="number">Tax</th>{showOriginal ? <th>Evidence</th> : null}</tr></thead>
    <tbody>{expenses.map((expense) => {
      const documentId = expense.document_id ?? (typeof expense.metadata_json?.documentIntelligenceId === "string" ? expense.metadata_json.documentIntelligenceId : null);
      const purchaseLocation = [expense.merchant_city, expense.merchant_state].filter(Boolean).join(", ");
      return <tr key={expense.id}><td>{expense.expense_date}</td><td>{expense.vendor || "Vendor not identified"}{purchaseLocation ? <small><br />Purchased near {purchaseLocation}</small> : null}{expense.source_kind === "statement_transaction" ? <small><br />Statement row · {expense.review_status.replaceAll("_", " ")}</small> : null}</td><td>{expense.category || "Uncategorized"}</td><td className="number">{money(expense.amount_cents)}</td><td className="number">{money(expense.tax_cents)}</td>{showOriginal ? <td>{documentId ? <Link href={`/api/expense-documents/${documentId}/original`} target="_blank">Original document</Link> : "Not attached"}</td> : null}</tr>;
    })}</tbody></table>;
}
