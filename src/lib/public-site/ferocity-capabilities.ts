export const publicFerocityCapabilities = [
  {
    key: "business_operator",
    name: "Ferocity Business Operator",
    outcome: "Diagnose the business, coordinate the next best work, and bring only protected decisions back to the owner.",
    href: "/features",
  },
  {
    key: "growth_revenue",
    name: "Growth & Revenue",
    outcome: "Find and act on the strongest opportunities across acquisition, sales, retention, referrals, and revenue.",
    href: "/features",
  },
  {
    key: "marketing",
    name: "Marketing System",
    outcome: "Plan, create, distribute, measure, and improve useful marketing without turning the business into content spam.",
    href: "/features",
  },
  {
    key: "leads_follow_up",
    name: "Leads & Follow-up",
    outcome: "Capture opportunities, respond quickly, keep the next step moving, and show what becomes revenue.",
    href: "/features",
  },
  {
    key: "calls_communications",
    name: "Calls & Communications",
    outcome: "Handle calls, texts, email, appointments, context, and human handoffs under the business's rules.",
    href: "/pricing",
  },
  {
    key: "ferocity_connect",
    name: "Ferocity Connect",
    outcome: "Use a compatible Android business phone for approved two-way business texting, scheduling, replies, and delivery tracking.",
    href: "/ferocity-connect",
  },
  {
    key: "work_operations",
    name: "Work & Operations",
    outcome: "Coordinate projects, jobs, tasks, schedules, documents, purchasing, handoffs, and exceptions.",
    href: "/features",
  },
  {
    key: "people_workforce",
    name: "People & Workforce",
    outcome: "Coordinate availability, assignments, hours, credentials, responsibilities, and payroll-ready records.",
    href: "/features",
  },
  {
    key: "money_profit",
    name: "Money & Profit",
    outcome: "Connect estimates, costs, receipts, invoices, collections, cash, and profitability to the work that created them.",
    href: "/features",
  },
  {
    key: "local_presence",
    name: "Local Presence & Reputation",
    outcome: "Keep local business information accurate, manage review workflows, publish useful updates, and connect discovery to revenue.",
    href: "/features",
  },
  {
    key: "integrations",
    name: "Connections & Integrations",
    outcome: "Connect the systems that matter while keeping authority, status, failures, and revocation visible.",
    href: "/integrations",
  },
] as const;

export type PublicFerocityCapabilityKey = (typeof publicFerocityCapabilities)[number]["key"];

const keys = new Set<string>(publicFerocityCapabilities.map((capability) => capability.key));

export function isPublicFerocityCapabilityKey(value: unknown): value is PublicFerocityCapabilityKey {
  return typeof value === "string" && keys.has(value);
}

export function publicFerocityCapabilityKnowledge() {
  return publicFerocityCapabilities.map(({ key, name, outcome }) => ({ key, name, outcome }));
}

export function resolvePublicFerocityCapabilities(values: unknown) {
  if (!Array.isArray(values)) return [];
  const selected = new Set(values.filter(isPublicFerocityCapabilityKey));
  return publicFerocityCapabilities
    .filter((capability) => selected.has(capability.key))
    .slice(0, 3)
    .map((capability) => ({
      key: capability.key,
      name: capability.name,
      outcome: capability.outcome,
      href: capability.href,
    }));
}
