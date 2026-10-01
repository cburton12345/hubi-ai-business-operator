import type { BusinessActionKey } from "@/lib/business-actions/catalog";

function hasAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

export function readBusinessActionForCommand(command: string): { action: BusinessActionKey; href: string } | null {
  const lower = command.toLowerCase();
  if (hasAny(lower, ["stale lead", "old lead", "leads need follow", "leads need attention"])) return { action: "getStaleLeads", href: "/app/leads" };
  if (hasAny(lower, ["open lead", "new lead", "show leads", "list leads"])) return { action: "getOpenLeads", href: "/app/leads" };
  if (hasAny(lower, ["unsold estimate", "open estimate", "estimate need follow", "estimates need attention"])) return { action: "getUnsoldEstimates", href: "/app/estimates" };
  if (hasAny(lower, ["outstanding invoice", "unpaid invoice", "overdue invoice", "who owes", "money owed"])) return { action: "getOutstandingInvoices", href: "/app/cash-collection" };
  if (hasAny(lower, ["open commitment", "outstanding commitment", "promises are open", "what did we promise"])) return { action: "getOpenCommitments", href: "/app/commitments" };
  return null;
}

export function summarizeBusinessActionItems(action: BusinessActionKey, data: unknown) {
  if (!data || typeof data !== "object") return [];
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.slice(0, 6).map((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const title = String(item.name ?? item.customerName ?? item.title ?? item.description ?? item.id ?? "Record");
    const status = item.status ? ` — ${String(item.status).replaceAll("_", " ")}` : "";
    const balance = typeof item.balanceCents === "number" ? ` — $${(item.balanceCents / 100).toFixed(2)} outstanding` : "";
    const prefix = action === "getOpenCommitments" ? "Commitment" : action === "getOutstandingInvoices" ? "Invoice" : action.includes("Estimate") ? "Estimate" : "Lead";
    return `${prefix}: ${title}${status}${balance}`;
  });
}
