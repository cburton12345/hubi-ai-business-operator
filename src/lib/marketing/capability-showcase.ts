export type CapabilityOutcome =
  "Get customers" | "Run the work" | "Get paid" | "Improve the business";

export type CapabilityShowcaseItem = {
  featureKey: string;
  label: string;
  outcome: CapabilityOutcome;
  customerValue: string;
  execution: string;
};

type EntitlementEvidence = {
  feature_key: string;
  status: string;
};

const showcaseRegistry: CapabilityShowcaseItem[] = [
  {
    featureKey: "closed_loop_growth_controller",
    label: "Closed-loop Growth planning",
    outcome: "Get customers",
    customerValue:
      "works backward from collected revenue through the funnel, margin, and capacity",
    execution:
      "Ferocity analyzes the evidence continuously and brings unsafe assumptions or real decisions back for review",
  },
  {
    featureKey: "ai_marketing_department",
    label: "AI Marketing Department",
    outcome: "Get customers",
    customerValue:
      "turns business activity, customer language, proof, and opportunities into prioritized marketing work",
    execution:
      "Ferocity recommends and prepares the next work; publishing and spend follow the workspace's approval rules",
  },
  {
    featureKey: "content_studio",
    label: "Content Studio",
    outcome: "Get customers",
    customerValue:
      "creates channel-ready posts, emails, articles, graphics, and video concepts from verified business evidence",
    execution:
      "Ferocity prepares variations and learns from performance instead of producing a disconnected pile of drafts",
  },
  {
    featureKey: "publishing_queue",
    label: "Organic publishing cadence",
    outcome: "Get customers",
    customerValue:
      "keeps approved, useful content moving across connected business profiles",
    execution:
      "Ferocity schedules eligible work within the owner's cadence and approval settings",
  },
  {
    featureKey: "ugc_proof_capture",
    label: "Customer proof engine",
    outcome: "Get customers",
    customerValue:
      "turns completed work, reviews, and approved media into reusable trust assets",
    execution:
      "Ferocity requests, organizes, and reuses proof only within the permissions recorded for it",
  },
  {
    featureKey: "follow_up_recovery",
    label: "Lead and estimate recovery",
    outcome: "Get customers",
    customerValue:
      "finds opportunities that are going cold and keeps the right follow-up from being forgotten",
    execution:
      "Ferocity queues or sends authorized follow-up and escalates conversations that need a person",
  },
  {
    featureKey: "job_tracker",
    label: "Jobs, scheduling, and field coordination",
    outcome: "Run the work",
    customerValue:
      "keeps customers, visits, assignments, job proof, and next steps connected",
    execution:
      "Ferocity watches for changes and coordinates authorized routine work without hiding exceptions",
  },
  {
    featureKey: "sms_send",
    label: "Ferocity Connect and managed messaging",
    outcome: "Run the work",
    customerValue:
      "keeps business texting, scheduled messages, delivery evidence, and customer history together",
    execution:
      "Ferocity uses the connected Android, hosted, or bring-your-own route selected by the business",
  },
  {
    featureKey: "voice_ai",
    label: "AI calls and receptionist workflows",
    outcome: "Run the work",
    customerValue:
      "answers, qualifies, follows up, books, and transfers calls using business context",
    execution:
      "Ferocity follows configured hours, transfer numbers, usage controls, and human-escalation rules",
  },
  {
    featureKey: "expense_document_intelligence",
    label: "Receipt and expense intelligence",
    outcome: "Get paid",
    customerValue:
      "extracts receipts, bills, warranties, and statements and connects approved costs to the right work",
    execution:
      "Ferocity preserves the original source and routes uncertain fields for review rather than silently guessing",
  },
  {
    featureKey: "invoice_payments",
    label: "Invoices, collection, and payment history",
    outcome: "Get paid",
    customerValue:
      "keeps billed work, reminders, payment status, and customer communication connected",
    execution:
      "Ferocity advances authorized collection steps and surfaces exceptions before they become surprises",
  },
  {
    featureKey: "ai_monitoring",
    label: "Owner attention and system monitoring",
    outcome: "Improve the business",
    customerValue:
      "watches connected workflows for failures, missing evidence, and decisions that actually need attention",
    execution:
      "Ferocity handles safe internal monitoring automatically and makes consequential decisions visible",
  },
];

export function buildCapabilityShowcase(
  entitlements: EntitlementEvidence[],
  limit = 8,
) {
  const available = new Set(
    entitlements
      .filter((row) => row.status !== "disabled")
      .map((row) => row.feature_key),
  );
  return showcaseRegistry
    .filter((item) => available.has(item.featureKey))
    .slice(0, Math.max(0, Math.min(limit, 12)));
}

export function isFerocityBusinessProfile(
  profile: { company_name?: unknown; website_url?: unknown } | null | undefined,
) {
  const company = String(profile?.company_name ?? "").toLowerCase();
  const website = String(profile?.website_url ?? "").toLowerCase();
  return company.includes("ferocity") || website.includes("ferocity.live");
}

export function capabilityShowcaseEvidence(items: CapabilityShowcaseItem[]) {
  return items.map(
    (item) =>
      `${item.outcome} — ${item.label}: ${item.customerValue}. ${item.execution}.`,
  );
}

export function capabilityShowcaseBody(items: CapabilityShowcaseItem[]) {
  const groups = new Map<CapabilityOutcome, CapabilityShowcaseItem[]>();
  for (const item of items)
    groups.set(item.outcome, [...(groups.get(item.outcome) ?? []), item]);
  const sections = [...groups].map(
    ([outcome, entries]) =>
      `${outcome}\n${entries.map((item) => `• ${item.label} — ${item.customerValue}.`).join("\n")}`,
  );
  return `Ferocity is not a shelf of tools the owner has to operate all day. It connects the work and, within the authority the business chooses, keeps the next step moving.\n\n${sections.join("\n\n")}\n\nConnections, outside actions, and consequential decisions still follow the business's permissions and approval rules.`;
}
