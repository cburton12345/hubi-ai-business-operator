import type { PoolClient } from "pg";
import { withPostgresTransaction } from "@/lib/db/postgres";

export type EstimatePricingLine = {
  quantity: number | string;
  unitPriceCents: number;
  unitCostCents: number;
  taxable: boolean;
  selected: boolean;
};

export type EstimatePricing = {
  subtotalCents: number;
  taxableSubtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  estimatedCostCents: number;
  grossProfitCents: number;
  grossMarginPercent: number | null;
  warnings: string[];
};

function boundedInteger(value: number, minimum = 0) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.round(value));
}

export function calculateEstimatePricing(input: {
  lines: EstimatePricingLine[];
  discountCents?: number;
  taxRateBps?: number;
  minimumMarginBps?: number;
}): EstimatePricing {
  const selected = input.lines.filter((line) => line.selected);
  const subtotalCents = selected.reduce(
    (sum, line) => sum + boundedInteger(Number(line.quantity) * boundedInteger(line.unitPriceCents)),
    0
  );
  const taxableSubtotalCents = selected
    .filter((line) => line.taxable)
    .reduce((sum, line) => sum + boundedInteger(Number(line.quantity) * boundedInteger(line.unitPriceCents)), 0);
  const estimatedCostCents = selected.reduce(
    (sum, line) => sum + boundedInteger(Number(line.quantity) * boundedInteger(line.unitCostCents)),
    0
  );
  const discountCents = Math.min(boundedInteger(input.discountCents ?? 0), subtotalCents);
  const taxRateBps = Math.min(boundedInteger(input.taxRateBps ?? 0), 100_000);
  const taxableDiscountCents = subtotalCents > 0
    ? Math.min(taxableSubtotalCents, Math.round(discountCents * (taxableSubtotalCents / subtotalCents)))
    : 0;
  const taxCents = Math.round(Math.max(0, taxableSubtotalCents - taxableDiscountCents) * taxRateBps / 10_000);
  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);
  const grossProfitCents = Math.max(0, subtotalCents - discountCents) - estimatedCostCents;
  const grossMarginPercent = subtotalCents - discountCents > 0
    ? Number(((grossProfitCents / (subtotalCents - discountCents)) * 100).toFixed(2))
    : null;
  const minimumMarginBps = boundedInteger(input.minimumMarginBps ?? 1_500);
  const warnings: string[] = [];

  if (selected.length === 0) warnings.push("No selected line items are included in the customer total.");
  if (selected.some((line) => boundedInteger(line.unitCostCents) === 0)) {
    warnings.push("One or more selected line items do not have cost evidence.");
  }
  if (grossMarginPercent !== null && Math.round(grossMarginPercent * 100) < minimumMarginBps) {
    warnings.push(`Estimated gross margin is below ${(minimumMarginBps / 100).toFixed(0)}%.`);
  }

  return {
    subtotalCents,
    taxableSubtotalCents,
    discountCents,
    taxCents,
    totalCents,
    estimatedCostCents,
    grossProfitCents,
    grossMarginPercent,
    warnings
  };
}

async function recalculateWithClient(client: PoolClient, tenantId: string, estimateId: string) {
  const estimateResult = await client.query<{
    customer_id: string;
    discount_cents: number;
    tax_rate_bps: number;
  }>(
    `select customer_id, discount_cents, tax_rate_bps
       from public.service_estimates
      where tenant_id=$1 and id=$2
      for update`,
    [tenantId, estimateId]
  );
  const estimate = estimateResult.rows[0];
  if (!estimate) return null;

  const linesResult = await client.query<{
    id: string;
    quantity: string;
    unit_price_cents: number;
    cost_cents: number;
    taxable: boolean;
    selected: boolean;
  }>(
    `select id, quantity::text, unit_price_cents, cost_cents, taxable, selected
       from public.estimate_line_items
      where tenant_id=$1 and estimate_id=$2
      order by position, id
      for update`,
    [tenantId, estimateId]
  );
  const pricing = calculateEstimatePricing({
    lines: linesResult.rows.map((line) => ({
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      unitCostCents: line.cost_cents,
      taxable: line.taxable,
      selected: line.selected
    })),
    discountCents: estimate.discount_cents,
    taxRateBps: estimate.tax_rate_bps
  });

  for (const line of linesResult.rows) {
    await client.query(
      `update public.estimate_line_items
          set total_cents=$4
        where tenant_id=$1 and estimate_id=$2 and id=$3`,
      [tenantId, estimateId, line.id, boundedInteger(Number(line.quantity) * line.unit_price_cents)]
    );
  }
  await client.query(
    `update public.service_estimates
        set subtotal_cents=$3, tax_cents=$4, total_cents=$5, updated_at=now()
      where tenant_id=$1 and id=$2`,
    [tenantId, estimateId, pricing.subtotalCents, pricing.taxCents, pricing.totalCents]
  );
  return { customerId: estimate.customer_id, pricing };
}

export async function recalculateEstimatePricing(tenantId: string, estimateId: string) {
  return withPostgresTransaction((client) => recalculateWithClient(client, tenantId, estimateId));
}

export async function updateEstimateOptionSelection(input: {
  tenantId: string;
  estimateId: string;
  selectedItemIds: string[];
}) {
  return withPostgresTransaction(async (client) => {
    await client.query(
      `update public.estimate_line_items
          set selected = case when id = any($3::uuid[]) then true else false end
        where tenant_id=$1 and estimate_id=$2 and optional=true`,
      [input.tenantId, input.estimateId, input.selectedItemIds]
    );
    return recalculateWithClient(client, input.tenantId, input.estimateId);
  });
}
