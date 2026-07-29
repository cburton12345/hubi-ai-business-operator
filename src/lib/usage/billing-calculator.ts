export type UsagePricingRule = {
  providerCostCents: number;
  quantity: number;
  includedRemaining?: number;
  fixedMarkupCents?: number;
  percentageMarkupBps?: number;
  minimumUnitPriceCents?: number;
  volumeDiscountBps?: number;
};

export type UsageBillingResult = {
  includedQuantity: number;
  billableQuantity: number;
  providerCostCents: number;
  customerChargeCents: number;
  grossProfitCents: number;
  grossMarginBps: number;
};

function money(value: number, options: { allowNegative?: boolean } = {}) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return options.allowNegative ? rounded : Math.max(0, rounded);
}

function bps(value?: number) {
  if (!Number.isFinite(value ?? 0)) return 0;
  return Math.max(0, value ?? 0) / 10000;
}

export function calculateUsageCharge(rule: UsagePricingRule): UsageBillingResult {
  const quantity = money(rule.quantity);
  const includedRemaining = money(rule.includedRemaining ?? 0);
  const includedQuantity = Math.min(quantity, includedRemaining);
  const billableQuantity = money(quantity - includedQuantity);
  const providerCostCents = money(rule.providerCostCents);

  if (quantity === 0 || billableQuantity === 0) {
    return {
      includedQuantity,
      billableQuantity,
      providerCostCents,
      customerChargeCents: 0,
      grossProfitCents: money(0 - providerCostCents, { allowNegative: true }),
      grossMarginBps: 0
    };
  }

  const billableCostRatio = billableQuantity / quantity;
  const billableProviderCostCents = money(providerCostCents * billableCostRatio);
  const fixedMarkupCents = money((rule.fixedMarkupCents ?? 0) * billableQuantity);
  const percentageCharge = money(billableProviderCostCents * (1 + bps(rule.percentageMarkupBps)));
  const fixedCharge = money(billableProviderCostCents + fixedMarkupCents);
  const minimumCharge = money((rule.minimumUnitPriceCents ?? 0) * billableQuantity);
  const beforeDiscount = Math.max(percentageCharge, fixedCharge, minimumCharge);
  const discount = beforeDiscount * bps(rule.volumeDiscountBps);
  const customerChargeCents = money(Math.max(0, beforeDiscount - discount));
  const grossProfitCents = money(customerChargeCents - billableProviderCostCents, { allowNegative: true });
  const grossMarginBps = customerChargeCents > 0 ? Math.round((grossProfitCents / customerChargeCents) * 10000) : 0;

  return {
    includedQuantity,
    billableQuantity,
    providerCostCents,
    customerChargeCents,
    grossProfitCents,
    grossMarginBps
  };
}

export function usageIdempotencyKey(parts: {
  tenantId: string;
  providerKey: string;
  providerEventId?: string | null;
  unitType: string;
  sourceId?: string | null;
}) {
  return [
    parts.tenantId,
    parts.providerKey,
    parts.providerEventId ?? "no-provider-event",
    parts.unitType,
    parts.sourceId ?? "no-source"
  ].join(":");
}
