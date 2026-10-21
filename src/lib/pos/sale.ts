import { z } from "zod";

export const posTenderTypes = ["unpaid", "cash", "card_external", "cash_app", "check", "external"] as const;

export const posSaleSchema = z.object({
  customerId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(180),
  tenderType: z.enum(posTenderTypes),
  externalReference: z.string().trim().max(180).nullable(),
  discountCents: z.number().int().min(0).max(100_000_000),
  taxRateBps: z.number().int().min(0).max(20_000),
  idempotencyKey: z.string().uuid(),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(240),
    quantity: z.number().positive().max(100_000),
    unitPriceCents: z.number().int().min(0).max(100_000_000)
  })).min(1).max(100)
});

export type PosSaleInput = z.infer<typeof posSaleSchema>;

export function calculatePosSale(input: Pick<PosSaleInput, "items" | "discountCents" | "taxRateBps">) {
  const lineTotals = input.items.map((item) => Math.round(item.quantity * item.unitPriceCents));
  const subtotalCents = lineTotals.reduce((sum, amount) => sum + amount, 0);
  const discountCents = Math.min(input.discountCents, subtotalCents);
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * input.taxRateBps / 10_000);
  return { lineTotals, subtotalCents, discountCents, taxCents, totalCents: taxableCents + taxCents };
}
