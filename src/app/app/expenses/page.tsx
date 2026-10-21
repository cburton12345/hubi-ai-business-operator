import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, FileSearch, ReceiptText, Search } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { requirePermission } from "@/lib/auth/require-permission";
import { getExpenseIntelligenceDashboard } from "@/lib/document-intelligence/dashboard";
import { getStatementYearCoverage } from "@/lib/document-intelligence/statement-year-coverage";
import { summarizeDocumentReviewIssues } from "@/lib/document-intelligence/review-issue-summary";
import { DocumentDropzone } from "./DocumentDropzone";
import { reviewExpenseDocumentAction, updateExpenseIntelligenceSettingsAction } from "./actions";
import { assignExpenseDocumentBatchProjectAction, cancelExpenseDocumentBatchAction } from "./upload-actions";

const DOCUMENTS_PER_PAGE = 8;

function money(value: number | null) {
  if (value === null) return "Needs confirmation";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function independentReviewCopy(status: string, humanReviewRequired: boolean) {
  switch (status) {
    case "passed":
      return {
        label: "Second check agrees",
        detail: humanReviewRequired
          ? "The two readings agree. Review the original and confirm before posting."
          : "The independent check matched Ferocity's first reading.",
        tone: "success",
      };
    case "disagreed":
      return {
        label: "Check these numbers",
        detail: "The two readings did not match. Compare the items below with the original before approving.",
        tone: "danger",
      };
    case "reviewer_unavailable":
      return {
        label: "Second check unavailable",
        detail: "Ferocity kept this document in review. Compare it with the original before approving.",
        tone: "",
      };
    case "human_confirmed":
      return {
        label: "Confirmed by a person",
        detail: "A workspace reviewer checked and confirmed this document.",
        tone: "success",
      };
    case "rejected":
      return {
        label: "Rejected",
        detail: "A workspace reviewer rejected this document.",
        tone: "danger",
      };
    default:
      return {
        label: "Needs review",
        detail: "Compare this document with the original before approving.",
        tone: "",
      };
  }
}

function uuidParam(value: string | string[] | undefined) {
  const candidate = typeof value === "string" ? value : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export default async function ExpenseIntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("tenant:view");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const projectId = uuidParam(params.project);
  const batchId = uuidParam(params.batch);
  const documentId = uuidParam(params.document);
  const dashboard = await getExpenseIntelligenceDashboard(actor.workspace.id, { search, projectId, batchId, documentId });
  const requestedPage = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const pageCount = Math.max(1, Math.ceil(dashboard.documents.length / DOCUMENTS_PER_PAGE));
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
  const firstDocumentIndex = (currentPage - 1) * DOCUMENTS_PER_PAGE;
  const visibleDocuments = dashboard.documents.slice(firstDocumentIndex, firstDocumentIndex + DOCUMENTS_PER_PAGE);
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (projectId) query.set("project", projectId);
    if (batchId) query.set("batch", batchId);
    if (documentId) query.set("document", documentId);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `/app/expenses?${suffix}` : "/app/expenses";
  };
  const documentHref = (selectedDocumentId: string) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (projectId) query.set("project", projectId);
    if (batchId) query.set("batch", batchId);
    query.set("document", selectedDocumentId);
    return `/app/expenses?${query.toString()}#document-${selectedDocumentId}`;
  };
  const importedCount = typeof params.importedCount === "string" ? Number(params.importedCount) : 0;
  const failedCount = typeof params.failedCount === "string" ? Number(params.failedCount) : 0;
  const duplicateCount = typeof params.duplicateCount === "string" ? Number(params.duplicateCount) : 0;
  const batchError = typeof params.batchError === "string" ? params.batchError : null;
  const error = typeof params.error === "string" ? params.error : null;
  const currentYear = new Date().getFullYear();
  const detectedYears = dashboard.documents.flatMap((document) => [
    document.document_date?.slice(0, 4),
    ...document.statementTransactions.map((transaction) => transaction.transactionDate?.slice(0, 4)),
  ]).map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= currentYear + 1);
  const taxYears = [...new Set([...detectedYears, currentYear, currentYear - 1, currentYear - 2])].sort((a, b) => b - a);
  const reportScope = { projectId, batchId };
  const reportScopeQuery = projectId ? `&project=${encodeURIComponent(projectId)}` : batchId ? `&batch=${encodeURIComponent(batchId)}` : "";
  const statementCoverageByYear = new Map((await Promise.all(taxYears.map(async (year) => [year, await getStatementYearCoverage(actor.workspace.id, year, reportScope)] as const))));

  return (
    <QueuePageShell
      eyebrow="Money"
      title="Receipts & Expenses"
      description="Ferocity preserves the source, reads the details, finds likely jobs, properties, units, and people, catches duplicates, and sends only uncertain decisions for review."
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
        <DocumentDropzone projects={dashboard.projects} />
        <details className="panel span-5 progressive-disclosure">
          <summary>
            <div>
              <p className="eyebrow">Settings</p>
              <h2>Automatic processing</h2>
              <p className="muted">Optional confidence and email-import controls.</p>
            </div>
          </summary>
          <form action={updateExpenseIntelligenceSettingsAction} className="form-stack progressive-disclosure-body">
            <p className="muted">Exact duplicates and uncertain documents always stop for review. Original files are always kept.</p>
            <label className="checkbox-row">
              <input name="autoProcess" type="checkbox" defaultChecked={dashboard.settings.auto_process_enabled} />
              <span>Automatically approve only when both the extracted details and destination are clear</span>
            </label>
            <label>Confidence threshold
              <select name="confidenceThreshold" defaultValue={dashboard.settings.auto_process_confidence}>
                <option value="0.90">90%</option><option value="0.92">92%</option><option value="0.95">95%</option><option value="0.98">98%</option>
              </select>
            </label>
            <button className="mini-button" type="submit">Save settings</button>
            <p className="muted">Email import can be connected later from Integrations.</p>
          </form>
        </details>
      </section>

      <section className="panel form-stack section-actions">
        <div className="panel-header-row">
          <div>
            <p className="eyebrow">Document projects and upload batches</p>
            <h2>Keep new evidence separate—or combine it deliberately</h2>
            <p className="muted">Every new selection has its own batch. Reused files remain linked to the new batch without duplicating the preserved source.</p>
          </div>
          {(projectId || batchId) ? <Link className="mini-button" href="/app/expenses">Show all documents</Link> : null}
        </div>
        {dashboard.projects.length ? <div className="button-row">
          {dashboard.projects.map((project) => <Link
            className={`mini-button${project.id === projectId ? " secondary-button" : ""}`}
            href={`/app/expenses?project=${project.id}`}
            key={project.id}
          >{project.name} · {project.documentCount} document{project.documentCount === 1 ? "" : "s"}</Link>)}
        </div> : <p className="muted">Create a project during the next upload when several batches belong to one tax year, property, job, or customer.</p>}
        {dashboard.batches.length ? <div className="form-stack">
          {dashboard.batches.map((batch) => <details className="progressive-disclosure" key={batch.id} open={batch.id === batchId}>
            <summary>
              <div>
                <strong>{batch.label}</strong>
                <p className="muted">{batch.importedFileCount} new · {batch.reusedFileCount} reused · {batch.failedFileCount} failed · {batch.unresolvedFileCount} unresolved / {batch.expectedFileCount} selected{batch.projectName ? ` · ${batch.projectName}` : " · separate batch"}</p>
              </div>
              <span className={`pill ${batch.status === "completed" ? "success" : batch.status === "processing" ? "medium" : "danger"}`}>{batch.status}</span>
            </summary>
            <div className="progressive-disclosure-body form-stack">
              <div className="button-row">
                <Link className="mini-button" href={`/app/expenses?batch=${batch.id}`}>Show this batch</Link>
                <form action={assignExpenseDocumentBatchProjectAction} className="button-row">
                  <input type="hidden" name="batchId" value={batch.id} />
                  <select name="projectId" defaultValue={batch.projectId ?? ""} aria-label={`Project for ${batch.label}`}>
                    <option value="">Keep separate</option>
                    {dashboard.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                  </select>
                  <button className="mini-button" type="submit">Save project</button>
                </form>
                {batch.status === "processing" ? <form action={cancelExpenseDocumentBatchAction}>
                  <input type="hidden" name="batchId" value={batch.id} />
                  <button className="mini-button danger-button" type="submit">Cancel remaining work</button>
                </form> : null}
              </div>
              <ul>{(batch.items as { fileIndex: number; fileName: string; outcome: string; documentId: string | null; error: string | null }[]).map((item) => <li key={`${batch.id}:${item.fileIndex}`}>
                <strong>{item.fileName}</strong> — {item.outcome}{item.error ? `: ${item.error}` : ""}
              </li>)}</ul>
              {batch.unresolvedFileCount ? <div className="notice danger"><AlertTriangle size={16} />{batch.unresolvedFileCount} selected file{batch.unresolvedFileCount === 1 ? " has" : "s have"} no recorded outcome. Retry or reconcile before using this batch as complete evidence.</div> : null}
            </div>
          </details>)}
        </div> : <p className="muted">No tracked upload batches yet. Existing historical documents remain preserved and can be backfilled into a project.</p>}
      </section>

      <section className="panel panel-header-row section-actions">
        <div>
          <p className="eyebrow">Print records</p>
          <h2>Tax packets by year</h2>
          <p className="muted">Expenses and deposits stay separate. Items still awaiting review remain visibly marked as draft evidence.</p>
        </div>
        <div className="form-stack">
          {taxYears.map((year) => {
            const coverage = statementCoverageByYear.get(year);
            return <div className="form-stack" key={year}>
              <div className="button-row">
                <strong>{year}</strong>
                <Link className="mini-button" href={`/app/reports/expense-tax-print?year=${year}${reportScopeQuery}`}>Expenses</Link>
                <Link className="mini-button" href={`/app/reports/income-tax-print?year=${year}${reportScopeQuery}`}>Deposits</Link>
                <Link className="mini-button secondary-button" href={`/app/reports/statement-packets?year=${year}${reportScopeQuery}`}>All statement packets</Link>
                <Link className="mini-button secondary-button" href={`/api/reports/expense-tax-export?year=${year}${reportScopeQuery}`}>Download CSV</Link>
              </div>
              {coverage && !coverage.complete ? <p className="notice danger"><AlertTriangle size={16} /><strong>Incomplete statement year.</strong> {coverage.message}</p> : null}
            </div>;
          })}
          <Link className="mini-button secondary-button" href="/app/reports">More reports</Link>
        </div>
      </section>

      <section className="panel section-actions">
        <form method="get" className="operator-command-input">
          <Search size={18} />
          <input name="q" defaultValue={search} placeholder='Try “property tax for 125 Maple”' aria-label="Search receipts and expenses" />
          <button className="mini-button" type="submit">Search</button>
          {search ? <Link className="mini-button" href={projectId ? `/app/expenses?project=${projectId}` : batchId ? `/app/expenses?batch=${batchId}` : "/app/expenses"}>Clear search</Link> : null}
        </form>
      </section>

      <section className="form-stack section-actions">
        {dashboard.documents.length ? <div className="panel panel-header-row" aria-live="polite">
          <p className="muted">
            Showing {firstDocumentIndex + 1}–{Math.min(firstDocumentIndex + DOCUMENTS_PER_PAGE, dashboard.documents.length)} of {dashboard.documents.length} document{dashboard.documents.length === 1 ? "" : "s"}
          </p>
          {pageCount > 1 ? <nav className="button-row" aria-label="Receipt and expense pages">
            {currentPage > 1 ? <Link className="mini-button" href={pageHref(currentPage - 1)} rel="prev">Previous</Link> : null}
            <span className="pill">Page {currentPage} of {pageCount}</span>
            {currentPage < pageCount ? <Link className="mini-button" href={pageHref(currentPage + 1)} rel="next">Next</Link> : null}
          </nav> : null}
        </div> : null}
        {dashboard.documents.length ? visibleDocuments.map((document) => {
          const expanded = documentId === document.id;
          const allocations = document.allocations as { targetLabel: string; targetType: string; targetRef: string | null; confidence: number; rationale: string }[];
          const lineItems = document.lineItems as { description: string; quantity: string | number | null; totalCents: number | null; confidence: number }[];
          const statementTransactions = document.statementTransactions as {
            id: string; transactionDate: string | null; description: string; merchantName: string | null;
            amountCents: number; direction: "debit" | "credit"; category: string | null; isTransfer: boolean;
            transferReason: string | null; confidence: number; status: string; duplicateConfidence: number | null;
             postedExpenseRef: string | null; counterpartyName: string | null; counterpartyHandle: string | null;
             note: string | null; transactionType: string | null; providerStatus: string | null;
             allocationTargetType: string | null; allocationTargetRef: string | null; allocationTargetLabel: string | null;
             allocationConfidence: number | null; allocationRationale: string | null;
          }[];
          const needsReview = document.status === "needs_review" || document.status === "duplicate" || document.status === "failed";
          const independentReview = document.independentReview as null | {
            status: string; humanReviewRequired: boolean;
            deterministicIssues: string[]; disagreements: string[];
          };
          const reviewCopy = independentReview
            ? independentReviewCopy(independentReview.status, independentReview.humanReviewRequired)
            : null;
           const rawReviewIssues = [...new Set([
             ...document.review_reasons_json,
             ...(independentReview?.deterministicIssues ?? []),
             ...(independentReview?.disagreements ?? []),
           ])];
           const reviewIssues = summarizeDocumentReviewIssues(rawReviewIssues);
           const statementApprovalBlocked = document.document_type === "statement" && (
             statementTransactions.length === 0
             || rawReviewIssues.some((issue) => /no usable document|pdf extraction (failed|omitted)/i.test(issue))
           );
          return (
            <article className="panel expense-document-card" id={`document-${document.id}`} key={document.id}>
              <div className="panel-header-row">
                <div>
                  <p className="eyebrow">{document.document_type.replaceAll("_", " ")} · {document.source_channel.replaceAll("_", " ")}</p>
                  <h2>{document.vendor_name || document.original_file_name}</h2>
                  <p className="muted">{document.document_date || "Date needs confirmation"} · {document.document_type === "statement" ? `${statementTransactions.length} extracted transaction${statementTransactions.length === 1 ? "" : "s"}` : money(document.total_cents)} · {Math.round(document.overallConfidence * 100)}% extraction confidence</p>
                  {reviewCopy ? <div className={`notice ${reviewCopy.tone}`.trim()}>
                    {reviewCopy.tone === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span><strong>{reviewCopy.label}.</strong> {reviewCopy.detail}</span>
                  </div> : null}
                </div>
                <span className={`pill ${document.status === "duplicate" ? "danger" : needsReview ? "medium" : "success"}`}>{document.status.replaceAll("_", " ")}</span>
              </div>
              {needsReview && !expanded ? (
                <div className="document-review-summary">
                  <span className="muted">
                    {rawReviewIssues.length
                      ? `${rawReviewIssues.length} source and review check${rawReviewIssues.length === 1 ? "" : "s"} retained.`
                      : "The extracted details need confirmation."}
                  </span>
                  <Link className="mini-button" href={`/api/expense-documents/${document.id}/original`} target="_blank">View original</Link>
                </div>
              ) : <div className="grid">
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
                  {document.document_type === "statement" && !needsReview && statementTransactions.length ? expanded
                    ? <details open><summary>{statementTransactions.filter((item) => item.status === "approved").length} charge(s) posted · {statementTransactions.filter((item) => item.status === "excluded").length} excluded</summary><ul>{statementTransactions.map((item) => <li key={item.id}>{item.transactionDate || "Date unknown"} · {item.merchantName || item.description} · {item.direction === "credit" ? "+" : "−"}{money(item.amountCents)} · {item.status.replaceAll("_", " ")}</li>)}</ul></details>
                    : <Link className="mini-button" href={documentHref(document.id)}>Open transaction details</Link>
                    : null}
                  {reviewIssues.length ? <div className="notice danger"><AlertTriangle size={16} /><span><strong>Check against the original:</strong> {reviewIssues.join(" ")}</span></div> : null}
                </div>
              </div>}
              {needsReview && !expanded ? (
                <div className="button-row document-review-launch">
                  <Link className="button" href={documentHref(document.id)}>
                    {document.document_type === "statement" ? `Review ${statementTransactions.length} transactions` : "Review this document"}
                  </Link>
                  <span className="muted">Opens one focused review without expanding every document on this page.</span>
                </div>
              ) : null}
              {needsReview && expanded ? (
                <form action={reviewExpenseDocumentAction} className="form-stack document-review-form">
                  <input type="hidden" name="documentId" value={document.id} />
                  {document.document_type === "statement" ? (
                    <section className="form-stack">
                      <div>
                        <h3>Choose the money in and money out to classify</h3>
                        <p className="muted">Select only rows you have classified and assigned. Unselected or unassigned rows stay in review; they are not posted or silently turned into general overhead. Transfers stay separate, and refundable security deposits are not rent.</p>
                      </div>
                      {statementTransactions.length ? statementTransactions.map((transaction) => {
                         // Merchant location is useful evidence, but it is not proof that a
                         // purchase belonged to the nearest property. Keep the explicit
                         // reviewer decision empty even when Ferocity has a suggestion.
                         const selectedAllocation = "unassigned|";
                        return (
                          <div className="statement-transaction-row" key={transaction.id}>
                            <label className="checkbox-row">
                              <input name="includeTransaction" type="checkbox" value={transaction.id} defaultChecked={false} />
                              <span>
                                <strong>{transaction.transactionDate || "Date needs review"} · {transaction.counterpartyName || transaction.merchantName || transaction.description}{transaction.counterpartyHandle ? ` (${transaction.counterpartyHandle})` : ""} · {transaction.direction === "credit" ? "Money in" : "Money out"} · {money(transaction.amountCents)}</strong>
                                <small className="muted">{transaction.direction}{transaction.category ? ` · ${transaction.category}` : ""} · {Math.round(transaction.confidence * 100)}% confidence{transaction.isTransfer ? ` · likely transfer${transaction.transferReason ? `: ${transaction.transferReason}` : ""}` : ""}{transaction.status === "duplicate" ? ` · possible duplicate (${Math.round((transaction.duplicateConfidence ?? 0) * 100)}%)` : ""}</small>
                                {transaction.note ? <small className="muted">Note: {transaction.note}</small> : null}
                              </span>
                            </label>
                            <label className="checkbox-row"><input name="excludeTransaction" type="checkbox" value={transaction.id} defaultChecked={false} /><span>Exclude this row from the workpaper</span></label>
                            <div className="grid compact-grid">
                              <label>Category<input name={`transactionCategory:${transaction.id}`} defaultValue={transaction.category ?? ""} maxLength={160} /></label>
                              <label>Belongs to<select name={`transactionAllocation:${transaction.id}`} defaultValue={selectedAllocation}>
                                {dashboard.allocationTargets.map((target) => <option key={`${transaction.id}:${target.type}|${target.ref ?? ""}`} value={`${target.type}|${target.ref ?? ""}`}>{target.type.replaceAll("_", " ")} — {target.label}</option>)}
                              </select>{transaction.allocationTargetLabel ? <small className="muted">Suggested: {transaction.allocationTargetLabel} ({Math.round((transaction.allocationConfidence ?? 0) * 100)}%)</small> : null}</label>
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
                      <select name="allocationKey" defaultValue={allocations[0] ? `${allocations[0].targetType}|${allocations[0].targetRef ?? ""}` : "unassigned|"}>
                        {dashboard.allocationTargets.map((target) => <option key={`${target.type}|${target.ref ?? ""}`} value={`${target.type}|${target.ref ?? ""}`}>{target.type.replaceAll("_", " ")} — {target.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="button-row">
                     <button className="button" name="decision" value="approve" type="submit" disabled={statementApprovalBlocked}>Confirm {document.document_type === "statement" ? "selected transactions" : document.document_type === "warranty" && document.total_cents === null ? "document" : "and post to Money"}</button>
                    <button className="mini-button" name="decision" value="reject" type="submit">Reject</button>
                    {document.status === "duplicate" ? <span className="muted">This may duplicate an existing document ({Math.round((document.duplicateConfidence ?? 0) * 100)}% match). Approving explicitly overrides the warning.</span> : null}
                    <Link className="mini-button" href={pageHref(currentPage)}>Close review</Link>
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
