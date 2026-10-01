import type { AllocationTarget, ProductExpenseAdapter } from "./types";

export type H4rPropertyTarget = {
  id: string;
  label: string;
  address?: string | null;
  aliases?: string[];
};

export type H4rUnitTarget = {
  id: string;
  label: string;
  propertyId: string;
  propertyLabel: string;
  address?: string | null;
  tenantNames?: string[];
};

export type H4rLeaseTarget = {
  id: string;
  label: string;
  propertyLabel?: string | null;
  unitLabel?: string | null;
  tenantNames?: string[];
};

export type H4rAllocationContext = {
  properties: H4rPropertyTarget[];
  units: H4rUnitTarget[];
  leases: H4rLeaseTarget[];
  openMaintenance?: { id: string; label: string; propertyLabel?: string | null; unitLabel?: string | null; vendor?: string | null }[];
};

export const h4rExpenseCategories = [
  ["maintenance", "Maintenance / repair"],
  ["capex", "Improvement / CapEx"],
  ["utilities", "Utilities"],
  ["taxes", "Property taxes"],
  ["insurance", "Insurance"],
  ["supplies", "Rental supplies"],
  ["rental_overhead", "Rental business overhead"]
] as const;

/** Converts H4R records into the shared engine's deployment-independent target contract. */
export function buildH4rAllocationTargets(context: H4rAllocationContext): AllocationTarget[] {
  return [
    ...context.properties.map((property) => ({
      type: "property", ref: property.id, label: property.label,
      aliases: [property.address ?? "", ...(property.aliases ?? [])], context: property.address,
      metadata: { propertyId: property.id }
    })),
    ...context.units.map((unit) => ({
      type: "unit", ref: unit.id, label: `${unit.propertyLabel} — ${unit.label}`,
      aliases: [unit.label, unit.propertyLabel, unit.address ?? "", ...(unit.tenantNames ?? [])],
      context: [unit.address, ...(unit.tenantNames ?? [])].filter(Boolean).join(" · "),
      metadata: { propertyId: unit.propertyId, unitId: unit.id }
    })),
    ...context.leases.map((lease) => ({
      type: "lease", ref: lease.id, label: lease.label,
      aliases: [lease.propertyLabel ?? "", lease.unitLabel ?? "", ...(lease.tenantNames ?? [])],
      context: [lease.propertyLabel, lease.unitLabel, ...(lease.tenantNames ?? [])].filter(Boolean).join(" · "),
      metadata: { leaseId: lease.id }
    })),
    ...(context.openMaintenance ?? []).map((work) => ({
      type: "maintenance", ref: work.id, label: work.label,
      aliases: [work.propertyLabel ?? "", work.unitLabel ?? "", work.vendor ?? ""],
      context: [work.propertyLabel, work.unitLabel, work.vendor].filter(Boolean).join(" · "),
      metadata: { maintenanceId: work.id }
    })),
    ...h4rExpenseCategories.map(([type, label]) => ({ type, ref: null, label, aliases: [type.replaceAll("_", " "), label] }))
  ];
}

/**
 * H4R supplies its own readers and canonical-ledger writer. This keeps credentials,
 * database topology, and property schema outside the shared engine.
 */
export function createH4rExpenseAdapter(input: {
  loadContext: (workspaceId: string) => Promise<H4rAllocationContext>;
  postToCanonicalLedger: NonNullable<ProductExpenseAdapter["postApprovedExpense"]>;
  postStatementTransactionsToCanonicalLedger?: NonNullable<ProductExpenseAdapter["postApprovedStatementTransactions"]>;
}): ProductExpenseAdapter {
  return {
    productKey: "h4r",
    listAllocationTargets: async ({ workspaceId }) => buildH4rAllocationTargets(await input.loadContext(workspaceId)),
    postApprovedExpense: input.postToCanonicalLedger,
    postApprovedStatementTransactions: input.postStatementTransactionsToCanonicalLedger
  };
}
