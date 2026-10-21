import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const expected = {
  expenses: 1762,
  expenseCents: 8405279,
  deposits: 212,
  depositCents: 14829968,
  transfers: 21,
  transferCents: 6870242,
  exactTenantCandidateRows: 69,
};

type TenantCandidate = {
  tenantId: string;
  tenantName: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
};

type ReportRow = {
  id: string;
  transaction_date: string | null;
  source_file: string;
  description: string;
  amount_cents: number;
  review_bucket?: string;
  h4r_review?: { tenantCandidates?: TenantCandidate[] } | null;
};

type Report = {
  counts: { expenses: number; deposits: number; transfers: number };
  totals: { expenseCents: number; depositCents: number; transferCents: number };
  propertyTotals: Array<{ property_id: string; property_name: string; count: number; amount_cents: number }>;
  deposits: ReportRow[];
  transfers: ReportRow[];
};

type PropertyBasis = {
  propertyId: string;
  propertyName: string;
  depositRows: number;
  depositCents: number;
  exactDepositCents: number;
  estimatedUnmatchedPaymentCents: number;
  expenseRows: number;
  expenseCents: number;
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function allocateLargestRemainder(total: number, weights: Array<{ key: string; weight: number }>) {
  const denominator = weights.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isInteger(total) || total < 0 || denominator <= 0) throw new Error("Allocation inputs are invalid.");
  const rows = weights.map((item) => {
    const exact = total * item.weight / denominator;
    return { key: item.key, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let centsLeft = total - rows.reduce((sum, item) => sum + item.amount, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) {
    if (centsLeft <= 0) break;
    row.amount += 1;
    centsLeft -= 1;
  }
  if (centsLeft !== 0) throw new Error("Largest-remainder allocation did not reconcile.");
  return new Map(rows.map((row) => [row.key, row.amount]));
}

async function main() {
  const reportPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const outputDirectory = process.argv[3] ? path.resolve(process.argv[3]) : null;
  if (!reportPath || !outputDirectory) throw new Error("Provide the verified financial report JSON and output directory.");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as Report;
  if (report.counts.expenses !== expected.expenses || report.totals.expenseCents !== expected.expenseCents
    || report.counts.deposits !== expected.deposits || report.totals.depositCents !== expected.depositCents
    || report.counts.transfers !== expected.transfers || report.totals.transferCents !== expected.transferCents) {
    throw new Error("Financial report failed the certified source count/total guard.");
  }

  const propertyExpenses = new Map(report.propertyTotals.map((row) => [row.property_id, { count: row.count, cents: row.amount_cents }]));
  const exactDeposits = report.deposits.filter((row) => row.review_bucket === "exact_tenant_name_candidate"
    && row.h4r_review?.tenantCandidates?.length === 1);
  if (exactDeposits.length !== expected.exactTenantCandidateRows) {
    throw new Error(`Expected ${expected.exactTenantCandidateRows} exact tenant-name deposit candidates; found ${exactDeposits.length}.`);
  }

  const cashAppPayments = report.deposits.filter((row) => typeof (row.h4r_review as { incomingCounterparty?: unknown } | null)?.incomingCounterparty === "string"
    && String((row.h4r_review as { incomingCounterparty?: string }).incomingCounterparty).trim().length > 0);
  const cashAppPaymentCents = cashAppPayments.reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const basisByProperty = new Map<string, PropertyBasis>();
  for (const property of report.propertyTotals.filter((row) => row.count > 0 && row.amount_cents > 0)) {
    basisByProperty.set(property.property_id, {
      propertyId: property.property_id,
      propertyName: property.property_name,
      depositRows: 0,
      depositCents: 0,
      exactDepositCents: 0,
      estimatedUnmatchedPaymentCents: 0,
      expenseRows: property.count,
      expenseCents: property.amount_cents,
    });
  }
  for (const row of exactDeposits) {
    const candidate = row.h4r_review!.tenantCandidates![0];
    const expenses = propertyExpenses.get(candidate.propertyId);
    if (!expenses || expenses.count < 1) {
      throw new Error(`Exact tenant candidate property has no expense allocation: ${candidate.propertyId}.`);
    }
    const current = basisByProperty.get(candidate.propertyId);
    if (!current) throw new Error(`Exact tenant candidate property is missing from the expense-bearing roster: ${candidate.propertyId}.`);
    current.depositRows += 1;
    current.depositCents += Number(row.amount_cents);
    current.exactDepositCents += Number(row.amount_cents);
  }
  const exactDepositCents = [...basisByProperty.values()].reduce((sum, row) => sum + row.exactDepositCents, 0);
  const unmatchedCashAppPaymentCents = cashAppPaymentCents - exactDepositCents;
  if (unmatchedCashAppPaymentCents <= 0) throw new Error("Unmatched Cash App payment pool is unexpectedly empty.");
  const estimatedUnmatched = allocateLargestRemainder(unmatchedCashAppPaymentCents,
    [...basisByProperty.values()].map((row) => ({ key: row.propertyId, weight: row.expenseCents })));
  for (const property of basisByProperty.values()) {
    property.estimatedUnmatchedPaymentCents = estimatedUnmatched.get(property.propertyId) ?? 0;
    property.depositCents += property.estimatedUnmatchedPaymentCents;
  }
  const propertyBasis = [...basisByProperty.values()].sort((a, b) => b.depositCents - a.depositCents || a.propertyName.localeCompare(b.propertyName));
  if (propertyBasis.reduce((sum, row) => sum + row.depositCents, 0) !== cashAppPaymentCents) {
    throw new Error("Combined exact and estimated Cash App payment basis does not reconcile.");
  }

  const annualTargets = allocateLargestRemainder(expected.transferCents,
    propertyBasis.map((row) => ({ key: row.propertyId, weight: row.depositCents })));
  const remaining = new Map(annualTargets);
  const transfers = [...report.transfers].sort((a, b) => (a.transaction_date ?? "").localeCompare(b.transaction_date ?? "") || a.id.localeCompare(b.id));
  const allocations: Array<{
    transferId: string;
    date: string | null;
    sourceFile: string;
    destination: string;
    transferCents: number;
    propertyId: string;
    propertyName: string;
    allocatedCents: number;
    basisDepositRows: number;
    basisDepositCents: number;
    exactDepositCents: number;
    estimatedUnmatchedPaymentCents: number;
    method: string;
  }> = [];

  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index];
    const finalTransfer = index === transfers.length - 1;
    const rowAllocation = finalTransfer
      ? new Map(remaining)
      : allocateLargestRemainder(Number(transfer.amount_cents), propertyBasis.map((row) => ({
          key: row.propertyId,
          weight: remaining.get(row.propertyId) ?? 0,
        })));
    const rowTotal = [...rowAllocation.values()].reduce((sum, cents) => sum + cents, 0);
    if (rowTotal !== Number(transfer.amount_cents)) {
      throw new Error(`Transfer allocation failed to reconcile for ${transfer.id}.`);
    }
    for (const basis of propertyBasis) {
      const allocatedCents = rowAllocation.get(basis.propertyId) ?? 0;
      if (allocatedCents < 0 || allocatedCents > (remaining.get(basis.propertyId) ?? 0)) {
        throw new Error(`Transfer allocation exceeded the remaining annual target for ${basis.propertyName}.`);
      }
      remaining.set(basis.propertyId, (remaining.get(basis.propertyId) ?? 0) - allocatedCents);
      if (allocatedCents === 0) continue;
      allocations.push({
        transferId: transfer.id,
        date: transfer.transaction_date,
        sourceFile: transfer.source_file,
        destination: transfer.description,
        transferCents: Number(transfer.amount_cents),
        propertyId: basis.propertyId,
        propertyName: basis.propertyName,
        allocatedCents,
        basisDepositRows: basis.depositRows,
        basisDepositCents: basis.depositCents,
        exactDepositCents: basis.exactDepositCents,
        estimatedUnmatchedPaymentCents: basis.estimatedUnmatchedPaymentCents,
        method: "hybrid_exact_deposits_plus_expense_weighted_unmatched_payments",
      });
    }
  }
  if ([...remaining.values()].some((cents) => cents !== 0)) throw new Error("Annual property targets were not fully allocated.");
  if (allocations.reduce((sum, row) => sum + row.allocatedCents, 0) !== expected.transferCents) {
    throw new Error("Transfer-property allocations do not reconcile to the transfer total.");
  }

  const propertyTotals = propertyBasis.map((basis) => ({
    ...basis,
    transferAllocatedCents: annualTargets.get(basis.propertyId) ?? 0,
    transferShare: (annualTargets.get(basis.propertyId) ?? 0) / expected.transferCents,
  }));
  const output = {
    version: "h4r_2025_bank_transfer_property_allocation_v2",
    generatedAt: new Date().toISOString(),
    sourceGuard: expected,
    totals: {
      exactTenantCandidateDepositCents: exactDepositCents,
      unmatchedCashAppPaymentCents,
      cashAppPaymentAllocationBasisCents: cashAppPaymentCents,
      bankTransferCents: expected.transferCents,
      merchantRefundAndOtherCreditCents: expected.depositCents - cashAppPaymentCents,
    },
    propertyTotals,
    transfers,
    allocations,
    method: {
      name: "Hybrid exact-deposit and expense-weighted unmatched-payment share",
      explanation: "Exact current-tenant-name deposit candidates stay with their matched properties. Unmatched person-to-person Cash App payments are distributed across every expense-bearing property in proportion to its assigned 2025 expenses. Merchant refunds and other credits are excluded. The 21 Cash App-to-bank transfers are then allocated from that combined annual payment basis.",
      limitation: "This is an owner-authorized annual bookkeeping allocation. Current-tenant name matches are not proof of a 2025 tenancy or rent period, and expense-weighted unmatched payments are estimates rather than source-proven rent allocations. Bank transfers are cash movements and are not counted as expenses or additional income.",
    },
  };

  const headers = ["transfer_date", "source_file", "destination", "transfer_amount", "assigned_property", "allocated_amount", "exact_match_deposit_rows", "exact_match_deposit_amount", "estimated_unmatched_payment_basis", "combined_payment_basis", "allocation_method"];
  const values = allocations.map((row) => [row.date, row.sourceFile, row.destination, (row.transferCents / 100).toFixed(2), row.propertyName,
    (row.allocatedCents / 100).toFixed(2), row.basisDepositRows, (row.exactDepositCents / 100).toFixed(2),
    (row.estimatedUnmatchedPaymentCents / 100).toFixed(2), (row.basisDepositCents / 100).toFixed(2), row.method]);
  const csv = [headers, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "H4R-2025-bank-transfer-property-allocation.json"), JSON.stringify(output, null, 2), { flag: "wx" }),
    writeFile(path.join(outputDirectory, "H4R-2025-bank-transfer-property-allocation.csv"), csv, { flag: "wx" }),
  ]);
  console.log(JSON.stringify({
    version: output.version,
    transferRows: transfers.length,
    allocationRows: allocations.length,
    propertyCount: propertyTotals.length,
    exactTenantCandidateDepositCents: exactDepositCents,
    unmatchedCashAppPaymentCents,
    cashAppPaymentAllocationBasisCents: cashAppPaymentCents,
    bankTransferCents: expected.transferCents,
    propertyTotals,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
