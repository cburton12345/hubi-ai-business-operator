export type ManagementPnlInput = {
  recognizedRevenueCents: number;
  refundsCents: number;
  directExpenseCents: number;
  directLaborCents: number;
  operatingExpenseCents: number;
  operatingLaborCents: number;
  paymentFeeCents: number;
  salesTaxCents: number;
  vendorBillsToReconcileCents: number;
  materialLogsToReconcileCents: number;
  unreviewedExpenseCents: number;
};

export type ManagementPnl = ManagementPnlInput & {
  netRevenueCents: number;
  costOfRevenueCents: number;
  grossProfitCents: number;
  totalOperatingExpenseCents: number;
  netOperatingIncomeCents: number;
};

export function buildManagementPnl(input: ManagementPnlInput): ManagementPnl {
  const netRevenueCents = input.recognizedRevenueCents - input.refundsCents;
  const costOfRevenueCents = input.directExpenseCents + input.directLaborCents;
  const grossProfitCents = netRevenueCents - costOfRevenueCents;
  const totalOperatingExpenseCents =
    input.operatingExpenseCents + input.operatingLaborCents + input.paymentFeeCents;

  return {
    ...input,
    netRevenueCents,
    costOfRevenueCents,
    grossProfitCents,
    totalOperatingExpenseCents,
    netOperatingIncomeCents: grossProfitCents - totalOperatingExpenseCents
  };
}
