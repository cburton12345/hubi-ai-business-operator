import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const ownerEmail = "burtonchristopher125@gmail.com";
const projectName = "H4R 2025 tax documents";

type Row = {
  id: string;
  source_file: string;
  transaction_date: string | null;
  description: string;
  merchant_name: string | null;
  direction: "debit" | "credit";
  amount_cents: number;
  is_transfer: boolean;
  suggested_category: string | null;
  status: string;
  allocation_target_type: string | null;
  allocation_target_ref: string | null;
  allocation_target_label: string | null;
  allocation_confidence: number | null;
  allocation_rationale: string | null;
  merchant_city: string | null;
  merchant_state: string | null;
  h4r_review: {
    version?: string;
    propertyCandidates?: Array<{ propertyId: string; propertyName: string; units: Array<{ unitId: string; unitLabel: string }> }>;
    incomingCounterparty?: string | null;
    tenantCandidates?: Array<{ tenantId: string; tenantName: string; unitId: string; unitLabel: string; propertyId: string; propertyName: string }>;
    tenantMatchStatus?: string;
  } | null;
  nearest_property_allocation: {
    version?: string;
    method?: string;
    distanceMiles?: number | null;
    ownerAuthorizedApproximateProximity?: boolean;
    confirmedFromReceiptOrJob?: boolean;
  } | null;
  property_candidates?: string;
  tenant_match?: string;
  review_bucket?: string;
  allocation_method?: string;
  allocation_distance_miles?: number | null;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function transactionCsv(rows: Row[]) {
  const headers = ["date", "source_file", "description", "merchant", "direction", "amount", "category", "city", "state", "assigned_property", "allocation_method", "allocation_confidence", "allocation_distance_miles", "allocation_rationale", "property_candidates", "tenant_match", "review_bucket", "review_status"];
  const values = rows.map((row) => [
    row.transaction_date, row.source_file, row.description, row.merchant_name, row.direction,
    (Number(row.amount_cents) / 100).toFixed(2), row.suggested_category || "Uncategorized",
    row.merchant_city, row.merchant_state, row.allocation_target_label || "Unassigned", row.allocation_method || "None",
    row.allocation_confidence === null ? "" : Number(row.allocation_confidence).toFixed(3),
    row.allocation_distance_miles ?? "", row.allocation_rationale || "", row.property_candidates || "None",
    row.tenant_match || "None", row.review_bucket, row.status,
  ]);
  return [headers, ...values].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

function propertyTotalsCsv(rows: Array<{ property_name: string; count: number; amount_cents: number; direct_nearest: number; same_day: number; same_month: number }>) {
  const headers = ["property", "expense_rows", "amount", "merchant_city_nearest_rows", "same_day_route_rows", "same_month_activity_rows"];
  const values = rows.map((row) => [row.property_name, row.count, (row.amount_cents / 100).toFixed(2), row.direct_nearest, row.same_day, row.same_month]);
  return [headers, ...values].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

async function main() {
  const outputDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!outputDirectory) throw new Error("Provide an explicit output directory.");
  const historicalContextPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
  const allocationEvidencePath = process.argv[4] ? path.resolve(process.argv[4]) : null;
  if (!allocationEvidencePath) throw new Error("Provide the certified applied allocation evidence file.");
  const historicalContext = historicalContextPath
    ? JSON.parse(await readFile(historicalContextPath, "utf8")) as {
        counts?: { payment_rows_2025?: number; charge_rows_2025?: number; ledger_evidence_rows_2025?: number };
        integrity?: { read_only?: boolean; mutations_performed?: number };
      }
    : null;
  if (historicalContext && (!historicalContext.integrity?.read_only || historicalContext.integrity.mutations_performed !== 0)) {
    throw new Error("Historical H4R evidence is not a verified read-only export.");
  }
  const allocationEvidence = JSON.parse(await readFile(allocationEvidencePath, "utf8")) as {
    version?: string; mode?: string;
    assignmentSummary?: { assignedRows?: number; assignedCents?: number };
    propertyTotals?: Array<{ propertyRef: string; propertyLabel: string; count: number; amountCents: number;
      methods: { merchant_city_nearest?: number; same_day_route?: number; same_month_activity?: number } }>;
  };
  if (allocationEvidence.version !== "h4r_2025_nearest_property_v1" || allocationEvidence.mode !== "applied"
    || allocationEvidence.assignmentSummary?.assignedRows !== 1762 || allocationEvidence.assignmentSummary.assignedCents !== 8405279
    || !Array.isArray(allocationEvidence.propertyTotals)) {
    throw new Error("Applied allocation evidence failed its version/count/total guard.");
  }
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const owner = await client.query(`select 1 from public.users u
      join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id
      where lower(u.email)=lower($2) and tu.status='active' and tu.role in ('owner','admin')
        and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected H4R owner/workspace mapping was not found.");

    const project = await client.query<{ id: string }>(`select id from public.document_intelligence_projects
      where tenant_id=$1 and name=$2 and tax_year=2025 and status='active'`, [tenantId, projectName]);
    if (project.rowCount !== 1) throw new Error("Expected one active H4R 2025 project.");

    const result = await client.query<Row>(`with scoped_documents as (
        select distinct d.id,d.original_file_name
        from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      )
      select t.id::text,d.original_file_name as source_file,t.transaction_date::text,
        coalesce(nullif(t.description,''),'Description unavailable') as description,
        t.merchant_name,t.direction,t.amount_cents,t.is_transfer,t.suggested_category,t.status,
        t.allocation_target_type,t.allocation_target_ref,t.allocation_target_label,t.allocation_confidence,t.allocation_rationale,
        coalesce(nullif(t.metadata_json->'h4r2025Review'->'merchantLocation'->>'city',''),nullif(t.metadata_json->>'merchantCity','')) as merchant_city,
        coalesce(nullif(t.metadata_json->'h4r2025Review'->'merchantLocation'->>'state',''),nullif(t.metadata_json->>'merchantState','')) as merchant_state,
        t.metadata_json->'h4r2025Review' as h4r_review,
        t.metadata_json->'h4r2025NearestPropertyAllocation' as nearest_property_allocation
      from public.document_intelligence_transactions t
      join scoped_documents d on d.id=t.document_id
      order by t.transaction_date,t.created_at,t.id`, [tenantId, project.rows[0].id]);

    if (result.rowCount !== 1995) throw new Error(`Expected 1,995 preserved transactions; found ${result.rowCount}.`);
    if (result.rows.some((row) => row.h4r_review?.version !== "h4r_cash_app_2025_deterministic_v3")) {
      throw new Error("Every scoped transaction must have the certified H4R 2025 review before export.");
    }
    const enriched = result.rows.map((row) => {
      const propertyCandidates = row.h4r_review?.propertyCandidates ?? [];
      const tenantCandidates = row.h4r_review?.tenantCandidates ?? [];
      const category = row.suggested_category?.trim() || "uncategorized";
      const reviewBucket = row.is_transfer ? "transfer_excluded" : row.direction === "credit"
        ? tenantCandidates.length === 1 ? "exact_tenant_name_candidate" : "deposit_source_needs_review"
        : category.endsWith("_needs_receipt") ? "receipt_and_business_purpose_needed"
        : category === "personal_or_nonbusiness_needs_review" ? "likely_personal_or_nonbusiness_review"
        : category.endsWith("_needs_review") ? "category_review_needed"
        : category === "uncategorized" || category === "payment_needs_classification" ? "classification_needed"
        : "categorized_candidate";
      return {
        ...row,
        property_candidates: propertyCandidates.map((candidate) => candidate.propertyName).join(" | "),
        tenant_match: tenantCandidates.length === 1
          ? `${tenantCandidates[0].tenantName} — ${tenantCandidates[0].unitLabel}`
          : tenantCandidates.length > 1 ? "Ambiguous tenant name" : "No exact active-tenant match",
        review_bucket: reviewBucket,
        allocation_method: row.nearest_property_allocation?.method || undefined,
        allocation_distance_miles: typeof row.nearest_property_allocation?.distanceMiles === "number"
          ? row.nearest_property_allocation.distanceMiles : null,
      };
    });
    const expenses = enriched.filter((row) => row.direction === "debit" && !row.is_transfer);
    const deposits = enriched.filter((row) => row.direction === "credit" && !row.is_transfer);
    const transfers = enriched.filter((row) => row.is_transfer);
    const invalidExpenseAllocations = expenses.filter((row) => !row.allocation_target_ref || !row.allocation_target_label
      || row.allocation_target_type !== "property"
      || row.nearest_property_allocation?.version !== "h4r_2025_nearest_property_v1"
      || row.nearest_property_allocation.ownerAuthorizedApproximateProximity !== true);
    if (invalidExpenseAllocations.length > 0) {
      throw new Error(`${invalidExpenseAllocations.length} expense rows are missing the certified property allocation.`);
    }
    const categoryTotals = Object.entries(expenses.reduce<Record<string, { count: number; amount_cents: number }>>((totals, row) => {
      const category = row.suggested_category?.trim() || "Uncategorized";
      const current = totals[category] ?? { count: 0, amount_cents: 0 };
      current.count += 1;
      current.amount_cents += Number(row.amount_cents);
      totals[category] = current;
      return totals;
    }, {})).map(([category, values]) => ({ category, ...values })).sort((a, b) => b.amount_cents - a.amount_cents);
    const reviewBucketTotals = Object.entries(expenses.reduce<Record<string, { count: number; amount_cents: number }>>((totals, row) => {
      const key = row.review_bucket || "classification_needed";
      const current = totals[key] ?? { count: 0, amount_cents: 0 };
      current.count += 1;
      current.amount_cents += Number(row.amount_cents);
      totals[key] = current;
      return totals;
    }, {})).map(([bucket, values]) => ({ bucket, ...values })).sort((a, b) => b.amount_cents - a.amount_cents);
    const expenseCityTotals = Object.values(expenses.reduce<Record<string, { city: string; state: string; count: number; amount_cents: number }>>((totals, row) => {
      const city = row.merchant_city || "City not identified";
      const state = row.merchant_state || "";
      const key = `${city}|${state}`;
      const current = totals[key] ?? { city, state, count: 0, amount_cents: 0 };
      current.count += 1;
      current.amount_cents += Number(row.amount_cents);
      totals[key] = current;
      return totals;
    }, {})).sort((a, b) => b.amount_cents - a.amount_cents);
    const propertyCandidateTotals = Object.values(expenses.reduce<Record<string, { property_id: string; property_name: string; count: number; amount_cents: number }>>((totals, row) => {
      for (const candidate of row.h4r_review?.propertyCandidates ?? []) {
        const current = totals[candidate.propertyId] ?? { property_id: candidate.propertyId, property_name: candidate.propertyName, count: 0, amount_cents: 0 };
        current.count += 1;
        current.amount_cents += Number(row.amount_cents);
        totals[candidate.propertyId] = current;
      }
      return totals;
    }, {})).sort((a, b) => b.amount_cents - a.amount_cents);
    const derivedPropertyTotals = Object.values(expenses.reduce<Record<string, {
      property_id: string; property_name: string; count: number; amount_cents: number;
      direct_nearest: number; same_day: number; same_month: number;
    }>>((totals, row) => {
      const propertyId = row.allocation_target_ref!;
      const current = totals[propertyId] ?? { property_id: propertyId, property_name: row.allocation_target_label!, count: 0,
        amount_cents: 0, direct_nearest: 0, same_day: 0, same_month: 0 };
      current.count += 1;
      current.amount_cents += Number(row.amount_cents);
      if (row.allocation_method === "merchant_city_nearest") current.direct_nearest += 1;
      else if (row.allocation_method === "same_day_route") current.same_day += 1;
      else if (row.allocation_method === "same_month_activity") current.same_month += 1;
      totals[propertyId] = current;
      return totals;
    }, {})).sort((a, b) => b.amount_cents - a.amount_cents || a.property_name.localeCompare(b.property_name));
    if (derivedPropertyTotals.reduce((sum, row) => sum + row.count, 0) !== expenses.length
      || derivedPropertyTotals.reduce((sum, row) => sum + row.amount_cents, 0) !== 8405279) {
      throw new Error("Exclusive property totals do not reconcile to the certified expense population.");
    }
    const derivedById = new Map(derivedPropertyTotals.map((row) => [row.property_id, row]));
    const propertyTotals = allocationEvidence.propertyTotals.map((row) => {
      const derived = derivedById.get(row.propertyRef);
      if (row.count > 0 && (!derived || derived.property_name !== row.propertyLabel
        || derived.count !== row.count || derived.amount_cents !== row.amountCents)) {
        throw new Error(`Applied allocation evidence does not match live rows for ${row.propertyLabel}.`);
      }
      return {
        property_id: row.propertyRef, property_name: row.propertyLabel, count: row.count, amount_cents: row.amountCents,
        direct_nearest: Number(row.methods.merchant_city_nearest ?? 0), same_day: Number(row.methods.same_day_route ?? 0),
        same_month: Number(row.methods.same_month_activity ?? 0),
      };
    });
    if (propertyTotals.reduce((sum, row) => sum + row.count, 0) !== expenses.length
      || propertyTotals.reduce((sum, row) => sum + row.amount_cents, 0) !== 8405279) {
      throw new Error("Complete property roster totals do not reconcile to the certified expense population.");
    }
    const payerSummaries = Object.values(deposits.reduce<Record<string, {
      payer: string; source_type: string; count: number; amount_cents: number; months: Set<string>; amounts: Set<number>; tenant_match: string | null;
    }>>((totals, row) => {
      const counterparty = row.h4r_review?.incomingCounterparty?.trim();
      const payer = counterparty || row.merchant_name?.trim() || row.description;
      const sourceType = counterparty ? "Cash App payment" : "Merchant refund / other credit";
      const key = `${sourceType}|${payer.toLowerCase()}`;
      const current = totals[key] ?? { payer, source_type: sourceType, count: 0, amount_cents: 0, months: new Set<string>(), amounts: new Set<number>(), tenant_match: null };
      current.count += 1;
      current.amount_cents += Number(row.amount_cents);
      if (row.transaction_date) current.months.add(row.transaction_date.slice(0, 7));
      current.amounts.add(Number(row.amount_cents));
      if (row.review_bucket === "exact_tenant_name_candidate") current.tenant_match = row.tenant_match || null;
      totals[key] = current;
      return totals;
    }, {})).map((item) => ({
      payer: item.payer, source_type: item.source_type, count: item.count, amount_cents: item.amount_cents,
      months: [...item.months].sort(), common_amounts_cents: [...item.amounts].sort((a, b) => b - a),
      tenant_match: item.tenant_match,
      recurring_pattern: item.months.size >= 3 || item.count >= 3,
    })).sort((a, b) => b.amount_cents - a.amount_cents);

    const summary = {
      project: { id: project.rows[0].id, name: projectName, taxYear: 2025 },
      coverage: { months: 12, sourceDocuments: 12, complete: true },
      counts: { allTransactions: result.rowCount, expenses: expenses.length, deposits: deposits.length, transfers: transfers.length },
      totals: {
        expenseCents: expenses.reduce((sum, row) => sum + Number(row.amount_cents), 0),
        depositCents: deposits.reduce((sum, row) => sum + Number(row.amount_cents), 0),
        transferCents: transfers.reduce((sum, row) => sum + Number(row.amount_cents), 0),
      },
      review: {
        expensesNeedingReview: expenses.filter((row) => row.status !== "approved").length,
        depositsNeedingReview: deposits.filter((row) => row.status !== "approved").length,
        expensesNeedingAssignment: expenses.filter((row) => !row.allocation_target_label).length,
        categorizedExpenseCandidates: expenses.filter((row) => row.review_bucket === "categorized_candidate").length,
        receiptAndBusinessPurposeNeeded: expenses.filter((row) => row.review_bucket === "receipt_and_business_purpose_needed").length,
        likelyPersonalOrNonbusinessReview: expenses.filter((row) => row.review_bucket === "likely_personal_or_nonbusiness_review").length,
        categoryReviewNeeded: expenses.filter((row) => row.review_bucket === "category_review_needed").length,
        classificationNeeded: expenses.filter((row) => row.review_bucket === "classification_needed").length,
        expensesWithPropertyCandidates: expenses.filter((row) => Boolean(row.property_candidates)).length,
        expensesAssignedToProperty: expenses.filter((row) => Boolean(row.allocation_target_label)).length,
        directNearestAssignments: expenses.filter((row) => row.allocation_method === "merchant_city_nearest").length,
        sameDayRouteAssignments: expenses.filter((row) => row.allocation_method === "same_day_route").length,
        sameMonthActivityAssignments: expenses.filter((row) => row.allocation_method === "same_month_activity").length,
        exactTenantNameCandidates: deposits.filter((row) => row.review_bucket === "exact_tenant_name_candidate").length,
        unmatchedDeposits: deposits.filter((row) => row.review_bucket === "deposit_source_needs_review").length,
      },
      categoryTotals,
      reviewBucketTotals,
      expenseCityTotals,
      propertyCandidateTotals,
      propertyTotals,
      payerSummaries,
      expenses,
      deposits,
      transfers,
      disclosure: "All 1,995 rows were reviewed against the preserved statements and a read-only H4R active-property/unit/tenant snapshot. Every outgoing non-transfer row has one owner-authorized proximity property assignment. The assignment is an editable bookkeeping allocation, not receipt/job proof or a tax-deductibility conclusion. Categories and exact tenant-name matches remain review candidates.",
      historicalH4rEvidence: historicalContext ? {
        paymentRows2025: Number(historicalContext.counts?.payment_rows_2025 ?? 0),
        chargeRows2025: Number(historicalContext.counts?.charge_rows_2025 ?? 0),
        ledgerEvidenceRows2025: Number(historicalContext.counts?.ledger_evidence_rows_2025 ?? 0),
        conclusion: "H4R production contains no 2025 ledger evidence, so unmatched 2025 Cash App deposits cannot be authoritatively assigned to historical tenants from H4R alone.",
      } : null,
    };
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDirectory, "H4R-2025-financial-breakdown.json"), JSON.stringify(summary, null, 2), { flag: "wx" }),
      writeFile(path.join(outputDirectory, "H4R-2025-expense-candidates.csv"), transactionCsv(expenses), { flag: "wx" }),
      writeFile(path.join(outputDirectory, "H4R-2025-property-totals.csv"), propertyTotalsCsv(propertyTotals), { flag: "wx" }),
      writeFile(path.join(outputDirectory, "H4R-2025-deposit-candidates.csv"), transactionCsv(deposits), { flag: "wx" }),
      writeFile(path.join(outputDirectory, "H4R-2025-transfers-separated.csv"), transactionCsv(transfers), { flag: "wx" }),
    ]);
    console.log(JSON.stringify({ outputDirectory, counts: summary.counts, totals: summary.totals, review: summary.review, categoryCount: categoryTotals.length }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
