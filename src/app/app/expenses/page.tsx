import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, FileSearch, ReceiptText, Search } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { requirePermission } from "@/lib/auth/require-permission";
import { getExpenseIntelligenceDashboard } from "@/lib/document-intelligence/dashboard";
import { DocumentDropzone } from "./DocumentDropzone";
import { importExpenseDocumentAction, reviewExpenseDocumentAction, updateExpenseIntelligenceSettingsAction } from "./actions";

function money(value: number | null) {
  if (value === null) return "Needs confirmation";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

export default async function ExpenseIntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("tenant:view");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const dashboard = await getExpenseIntelligenceDashboard(actor.workspace.id, search);
  const importedCount = typeof params.importedCount === "string" ? Number(params.importedCount) : 0;
  const failedCount = typeof params.failedCount === "string" ? Number(params.failedCount) : 0;
  const duplicateCount = typeof params.duplicateCount === "string" ? Number(params.duplicateCount) : 0;
  const batchError = typeof params.batchError === "string" ? params.batchError : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <QueuePageShell
      eyebrow="Money"
      title="Receipts & Expenses"
      description="Ferocity preserves the source, reads the details, finds likely jobs and people, catches duplicates, and sends only uncertain decisions for review."
    >
      {importedCount ? <div className="notice success"><CheckCircle2 size={18} /> {importedCount} document{importedCount === 1 ? "" : "s"} imported and analyzed.{duplicateCount ? ` ${duplicateCount} possible duplicate${duplicateCount === 1 ? " was" : "s were"} held for review.` : ""}</div> : null}
      {failedCount ? <div className="notice danger"><AlertTriangle size={18} /> {failedCount} document{failedCount === 1 ? "" : "s"} could not be processed. Documents that succeeded were kept.{batchError ? ` ${batchError}` : ""}</div> : null}
      {error ? <div className="notice danger"><AlertTriangle size={18} /> {error}</div> : null}

      <section className="grid section-actions">
        <Metric label="All documents" value={dashboard.metrics.total} icon={<ReceiptText size={18} />} />
        <Metric label="Need review" value={dashboard.metrics.needsReview} icon={<FileSearch size={18} />} />
        <Metric label="Possible duplicates" value={dashboard.metrics.duplicates} icon={<Copy size={18} />} />
        <Metric label="Approved documents" value={dashboard.metrics.approved} icon={<CheckCircle2 size={18} />} />
      </section>

      <section className="grid section-actions">
        <DocumentDropzone action={importExpenseDocumentAction} />
        <form action={updateExpenseIntelligenceSettingsAction} className="panel form-stack span-5">
          <p className="eyebrow">Automation control</p>
          <h2>Let high-confidence work flow automatically</h2>
          <p className="muted">Exact duplicates and ambiguous documents always stop for review. Source files are always retained.</p>
          <label className="checkbox-row">
            <input name="autoProcess" type="checkbox" defaultChecked={dashboard.settings.auto_process_enabled} />
            <span>Auto-approve only when extraction and allocation both clear the confidence threshold</span>
          </label>
          <label>Confidence threshold
            <select name="confidenceThreshold" defaultValue={dashboard.settings.auto_process_confidence}>
              <option value="0.90">90%</option><option value="0.92">92%</option><option value="0.95">95%</option><option value="0.98">98%</option>
            </select>
          </label>
          <button className="mini-button" type="submit">Save automation setting</button>
          <p className="muted">Email import is supported by the secure ingestion endpoint; connect a mailbox rule or inbound-email provider before publishing an address.</p>
        </form>
      </section>

      <section className="panel section-actions">
        <form method="get" className="operator-command-input">
          <Search size={18} />
          <input name="q" defaultValue={search} placeholder='Try “Menards roofing screws for Johnson”' aria-label="Search receipts and expenses" />
          <button className="mini-button" type="submit">Search</button>
          {search ? <Link className="mini-button" href="/app/expenses">Clear</Link> : null}
        </form>
      </section>

      <section className="form-stack section-actions">
        {dashboard.documents.length ? dashboard.documents.map((document) => {
          const allocations = document.allocations as { targetLabel: string; targetType: string; targetRef: string | null; confidence: number; rationale: string }[];
          const lineItems = document.lineItems as { description: string; quantity: string | number | null; totalCents: number | null; confidence: number }[];
          const statementTransactions = document.statementTransactions as {
            id: string; transactionDate: string | null; description: string; merchantName: string | null;
            amountCents: number; direction: "debit" | "credit"; category: string | null; isTransfer: boolean;
            transferReason: string | null; confidence: number; status: string; duplicateConfidence: number | null;
            postedExpenseRef: string | null;
          }[];
          const needsReview = document.status === "needs_review" || document.status === "duplicate" || document.status === "failed";
          return (
            <article className="panel expense-document-card" key={document.id}>
              <div className="panel-header-row">
                <div>
                  <p className="eyebrow">{document.document_type.replaceAll("_", " ")} · {document.source_channel.replaceAll("_", " ")}</p>
                  <h2>{document.vendor_name || document.original_file_name}</h2>
                  <p className="muted">{document.document_date || "Date needs confirmation"} · {document.document_type === "statement" ? `${statementTransactions.length} extracted transaction${statementTransactions.length === 1 ? "" : "s"}` : money(document.total_cents)} · {Math.round(document.overallConfidence * 100)}% extraction confidence</p>
                </div>
                <span className={`pill ${document.status === "duplicate" ? "danger" : needsReview ? "medium" : "success"}`}>{document.status.replaceAll("_", " ")}</span>
              </div>
              <div className="grid">
                <div className="span-5">
                  <h3>Ferocity determined</h3>
                  <dl className="document-fields">
                    <div><dt>Number</dt><dd>{document.document_number || "Not found"}</dd></div>
                    <div><dt>Subtotal</dt><dd>{money(document.subtotal_cents)}</dd></div>
                    <div><dt>Tax</dt><dd>{money(document.tax_cents)}</dd></div>
                    <div><dt>Payment</dt><dd>{document.payment_method || "Not shown"}</dd></div>
                    <div><dt>Category</dt><dd>{document.suggested_category || "Needs confirmation"}</dd></div>
                  </dl>
                  <Link className="mini-button" href={`/api/expense-documents/${document.id}/original`} target="_blank">View original</Link>
                </div>
                <div className="span-7">
                  <h3>Likely belongs to</h3>
                  {allocations.length ? allocations.map((allocation) => (
                    <p key={`${allocation.targetType}:${allocation.targetLabel}`}><strong>{allocation.targetLabel}</strong> <span className="muted">({Math.round(allocation.confidence * 100)}%) — {allocation.rationale}</span></p>
                  )) : <p className="muted">No allocation suggestion yet.</p>}
                  {lineItems.length ? <details><summary>{lineItems.length} extracted line item(s)</summary><ul>{lineItems.map((item, index) => <li key={index}>{item.description}{item.quantity ? ` × ${item.quantity}` : ""} — {money(item.totalCents)}</li>)}</ul></details> : null}
                  {document.document_type === "statement" && !needsReview && statementTransactions.length ? <details><summary>{statementTransactions.filter((item) => item.status === "approved").length} charge(s) posted · {statementTransactions.filter((item) => item.status === "excluded").length} excluded</summary><ul>{statementTransactions.map((item) => <li key={item.id}>{item.transactionDate || "Date unknown"} · {item.merchantName || item.description} · {item.direction === "credit" ? "+" : "−"}{money(item.amountCents)} · {item.status.replaceAll("_", " ")}</li>)}</ul></details> : null}
                  {document.review_reasons_json.length ? <div className="notice"><AlertTriangle size={16} /><span>{document.review_reasons_json.join(" ")}</span></div> : null}
                </div>
              </div>
              {needsReview ? (
                <form action={reviewExpenseDocumentAction} className="form-stack document-review-form">
                  <input type="hidden" name="documentId" value={document.id} />
                  {document.document_type === "statement" ? (
                    <section className="form-stack">
                      <div>
                        <h3>Choose the charges to post</h3>
                        <p className="muted">Debits are selected by default. Credits, likely transfers, and possible duplicates stay out unless you deliberately select them. The original statement remains attached to every posted expense.</p>
                      </div>
                      {statementTransactions.length ? statementTransactions.map((transaction) => {
                        const safeDefault = transaction.direction === "debit" && !transaction.isTransfer && transaction.status !== "duplicate";
                        return (
                          <div className="statement-transaction-row" key={transaction.id}>
                            <label className="checkbox-row">
                              <input name="includeTransaction" type="checkbox" value={transaction.id} defaultChecked={safeDefault} />
                              <span>
                                <strong>{transaction.transactionDate || "Date needs review"} · {transaction.merchantName || transaction.description} · {money(transaction.amountCents)}</strong>
                                <small className="muted">{transaction.direction}{transaction.category ? ` · ${transaction.category}` : ""} · {Math.round(transaction.confidence * 100)}% confidence{transaction.isTransfer ? ` · likely transfer${transaction.transferReason ? `: ${transaction.transferReason}` : ""}` : ""}{transaction.status === "duplicate" ? ` · possible duplicate (${Math.round((transaction.duplicateConfidence ?? 0) * 100)}%)` : ""}</small>
                              </span>
                            </label>
                            <div className="grid compact-grid">
                              <label>Category<input name={`transactionCategory:${transaction.id}`} defaultValue={transaction.category ?? ""} maxLength={160} /></label>
                              <label>Belongs to<select name={`transactionAllocation:${transaction.id}`} defaultValue={allocations[0] ? `${allocations[0].targetType}|${allocations[0].targetRef ?? ""}` : "business_overhead|"}>
                                {dashboard.allocationTargets.map((target) => <option key={`${transaction.id}:${target.type}|${target.ref ?? ""}`} value={`${target.type}|${target.ref ?? ""}`}>{target.type.replaceAll("_", " ")} — {target.label}</option>)}
                              </select></label>
                            </div>
                          </div>
                        );
                      }) : <div className="notice danger"><AlertTriangle size={16} />No transactions were extracted. Split or rescan the statement before approving it.</div>}
                    </section>
                  ) : null}
                  <div className="grid">
                    <label className="span-3">Vendor<input name="vendorName" defaultValue={document.vendor_name ?? ""} /></label>
                    <label className="span-2">Type<select name="documentType" defaultValue={document.document_type}>
                      <option value="receipt">Receipt</option><option value="invoice">Invoice</option><option value="bill">Bill</option>
                      <option value="purchase_order">Purchase order</option><option value="warranty">Warranty</option>
                      <option value="credit_memo">Credit memo</option><option value="statement">Statement</option><option value="other">Other</option>
                    </select></label>
                    <label className="span-2">Date<input name="documentDate" type="date" defaultValue={document.document_date ?? ""} /></label>
                    {document.document_type !== "statement" ? <><label className="span-2">Total<input name="total" inputMode="decimal" defaultValue={document.total_cents === null ? "" : (document.total_cents / 100).toFixed(2)} /></label>
                    <label className="span-2">Tax<input name="tax" inputMode="decimal" defaultValue={document.tax_cents === null ? "" : (document.tax_cents / 100).toFixed(2)} /></label></> : null}
                    <label className="span-3">Category<input name="category" defaultValue={document.suggested_category ?? ""} /></label>
                    <label className="span-12">Belongs to
                      <select name="allocationKey" defaultValue={allocations[0] ? `${allocations[0].targetType}|${allocations[0].targetRef ?? ""}` : "business_overhead|"}>
                        {dashboard.allocationTargets.map((target) => <option key={`${target.type}|${target.ref ?? ""}`} value={`${target.type}|${target.ref ?? ""}`}>{target.type.replaceAll("_", " ")} — {target.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="button-row">
                    <button className="button" name="decision" value="approve" type="submit" disabled={document.document_type === "statement" && statementTransactions.length === 0}>Confirm {document.document_type === "statement" ? "selected charges and post to Money" : document.document_type === "warranty" && document.total_cents === null ? "document" : "and post to Money"}</button>
                    <button className="mini-button" name="decision" value="reject" type="submit">Reject</button>
                    {document.status === "duplicate" ? <span className="muted">This may duplicate an existing document ({Math.round((document.duplicateConfidence ?? 0) * 100)}% match). Approving explicitly overrides the warning.</span> : null}
                  </div>
                </form>
              ) : null}
            </article>
          );
        }) : <div className="panel empty-state"><ReceiptText size={26} /><h2>{search ? "No documents matched that search" : "Your expense evidence will appear here"}</h2><p className="muted">Import the first document above.</p></div>}
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <article className="panel metric span-3"><span>{icon}</span><strong>{value}</strong><small>{label}</small></article>;
}
