import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputVersion = "h4r_2025_preparer_review_workpaper_v15_source";
const outputVersion = "h4r_2025_worker_expense_workpaper_v15";
const workerPaymentPattern = /^To (.+?) Cash App payment$/i;

type ExpenseLine = {
  transactionId: string;
  description: string;
  reviewTreatment: string;
  reviewBucket: string;
  suggestedCategory: string;
  capitalizationReview: boolean;
  propertyId: string;
  expenseCents: number;
  [key: string]: unknown;
};

async function main() {
  const inputPath = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length);
  const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  if (!inputPath || !outputPath) throw new Error("Provide --input and --output.");
  const report = JSON.parse(await readFile(path.resolve(inputPath), "utf8")) as {
    version: string;
    totals: Record<string, number>;
    methodology: Record<string, unknown>;
    propertyTotals: Array<Record<string, unknown>>;
    expenseLines: ExpenseLine[];
    transactionControls: Array<{ transactionId: string; sourceAmountCents: number; distributedCents: number }>;
    reviewBucketTotals: Record<string, { cents: number; sourceTransactions: number }>;
    [key: string]: unknown;
  };
  if (report.version !== inputVersion || report.totals.totalOutflowCents !== 8405279
    || report.totals.candidateExpenseCents !== 5583862 || report.totals.reviewExpenseCents !== 2821417) {
    throw new Error("v15 source guard failed.");
  }

  const workerTransactions = new Map<string, { payee: string; sourceAmountCents: number }>();
  for (const control of report.transactionControls) {
    const representative = report.expenseLines.find((line) => line.transactionId === control.transactionId);
    const match = representative?.description.match(workerPaymentPattern);
    if (representative?.reviewTreatment !== "classification_review" || !match?.[1]) continue;
    workerTransactions.set(control.transactionId, { payee: match[1].trim(), sourceAmountCents: control.sourceAmountCents });
  }
  const workerPaymentCents = [...workerTransactions.values()].reduce((sum, row) => sum + row.sourceAmountCents, 0);
  if (workerTransactions.size !== 34 || workerPaymentCents !== 738513) {
    throw new Error(`Worker-payment guard failed: ${workerTransactions.size} rows / ${workerPaymentCents} cents.`);
  }

  const expenseLines = report.expenseLines.map((line) => {
    const worker = workerTransactions.get(line.transactionId);
    if (!worker) return line;
    return {
      ...line,
      reviewBucket: "categorized_candidate",
      reviewTreatment: "candidate_rental_expense",
      suggestedCategory: "labor_and_contracted_services",
      workerPayment: true,
      workerPayee: worker.payee,
      preparerReportingNote: "Owner confirmed this payee performed work. Include as a business labor/service expense candidate; retain payee records for preparer reporting decisions.",
    };
  });

  const propertyTotals = report.propertyTotals.map((property) => {
    const propertyId = String(property.propertyId);
    const lines = expenseLines.filter((line) => line.propertyId === propertyId);
    const sumTreatment = (treatment: string) => lines.filter((line) => line.reviewTreatment === treatment).reduce((sum, line) => sum + line.expenseCents, 0);
    const candidateExpenseCents = sumTreatment("candidate_rental_expense");
    const likelyPersonalCents = sumTreatment("likely_personal_excluded_pending_override");
    const receiptReviewCents = sumTreatment("receipt_or_business_purpose_review");
    const classificationReviewCents = sumTreatment("classification_review");
    const categoryReviewCents = sumTreatment("category_review");
    const reviewExpenseCents = likelyPersonalCents + receiptReviewCents + classificationReviewCents + categoryReviewCents;
    const totalOutflowCents = candidateExpenseCents + reviewExpenseCents;
    const estimatedCashAppIncomeCents = Number(property.estimatedCashAppIncomeCents);
    return {
      ...property,
      candidateExpenseCents,
      reviewExpenseCents,
      likelyPersonalCents,
      receiptReviewCents,
      classificationReviewCents,
      categoryReviewCents,
      totalOutflowCents,
      candidateIncomeLessExpenseCents: estimatedCashAppIncomeCents - candidateExpenseCents,
      capitalizationReviewCents: lines.filter((line) => line.capitalizationReview).reduce((sum, line) => sum + line.expenseCents, 0),
    };
  });

  const treatments = ["candidate_rental_expense", "receipt_or_business_purpose_review", "likely_personal_excluded_pending_override", "classification_review", "category_review"];
  const reviewBucketTotals = Object.fromEntries(treatments.map((treatment) => {
    const lines = expenseLines.filter((line) => line.reviewTreatment === treatment);
    return [treatment, { cents: lines.reduce((sum, line) => sum + line.expenseCents, 0), sourceTransactions: new Set(lines.map((line) => line.transactionId)).size }];
  }));
  const candidateExpenseCents = propertyTotals.reduce((sum, row) => sum + Number(row.candidateExpenseCents), 0);
  const reviewExpenseCents = propertyTotals.reduce((sum, row) => sum + Number(row.reviewExpenseCents), 0);
  const totalOutflowCents = propertyTotals.reduce((sum, row) => sum + Number(row.totalOutflowCents), 0);
  if (candidateExpenseCents !== 6322375 || reviewExpenseCents !== 2082904 || totalOutflowCents !== 8405279
    || reviewBucketTotals.classification_review.cents !== 99694 || reviewBucketTotals.classification_review.sourceTransactions !== 15) {
    throw new Error("v15 recomputation guard failed.");
  }

  const workerPayees = [...workerTransactions.entries()].map(([transactionId, row]) => ({ transactionId, ...row }));
  const output = {
    ...report,
    version: outputVersion,
    generatedAt: new Date().toISOString(),
    methodology: {
      ...report.methodology,
      workerPayments: "Owner confirmed the 34 named outgoing Cash App payments were payments to workers. They are included as labor/service expense candidates and remain separately identifiable for payee reporting records.",
    },
    totals: {
      ...report.totals,
      candidateExpenseCents,
      reviewExpenseCents,
      totalOutflowCents,
      candidateIncomeLessExpenseCents: Number(report.totals.estimatedCashAppIncomeCents) - candidateExpenseCents,
      confirmedWorkerPaymentCents: workerPaymentCents,
    },
    reviewBucketTotals,
    propertyTotals,
    expenseLines,
    workerPayees,
  };
  await writeFile(path.resolve(outputPath), JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ version: outputVersion, workerTransactions: workerTransactions.size, workerPaymentCents, totals: output.totals, reviewBucketTotals }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
