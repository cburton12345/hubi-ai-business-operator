export type CapabilityDiscoveryState = {
  hasGrowthController: boolean;
  hasActiveGrowthObjective: boolean;
  hasExpenseIntelligence: boolean;
  hasImportedExpenseDocuments: boolean;
  hasFerocityConnect: boolean;
  hasPairedAndroidDevice: boolean;
};

export type CapabilityRecommendation = {
  key:
    | "growth_controller" | "lead_recovery" | "cash_collection" | "jobs_operations"
    | "phone_office" | "ferocity_connect" | "email_calendar" | "expense_intelligence"
    | "workforce" | "local_presence" | "content_distribution" | "integrations" | "owner_attention";
  title: string;
  why: string;
  command: string;
  href: string;
};

function mentions(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

type ScoredRecommendation = CapabilityRecommendation & { score: number };

function add(recommendations: ScoredRecommendation[], condition: boolean, item: ScoredRecommendation) {
  if (condition && !recommendations.some((candidate) => candidate.key === item.key)) recommendations.push(item);
}

/** Surfaces a few relevant operating paths, never a generic feature dump. */
export function discoverRelevantCapabilities(command: string, state: CapabilityDiscoveryState, limit = 3): CapabilityRecommendation[] {
  const setup = mentions(command, ["set up", "set ferocity up", "setup", "start", "bottleneck", "automate", "what can ferocity", "everything", "run my business"]);
  const recommendations: ScoredRecommendation[] = [];

  const growth = mentions(command, ["grow", "growth", "make money", "revenue", "profit", "sales", "fill my", "fill our", "opportunit"]);
  add(recommendations, state.hasGrowthController && !state.hasActiveGrowthObjective && (setup || growth), {
    key: "growth_controller", score: growth ? 98 : 78,
    title: "Build the result backward from revenue and capacity",
    why: "No active outcome plan is configured. Ferocity can translate the result into required opportunities, sales, capacity, cash, and next actions.",
    command: "Build a realistic growth objective from my business data. Work backward from collected cash and profit, show assumptions, and tell me the first actions.",
    href: "/app/growth"
  });

  const leadRecovery = mentions(command, ["lead", "estimate", "quote", "follow up", "follow-up", "missed call", "reactivate", "sales", "opportunit", "customer acquisition"]);
  add(recommendations, setup || leadRecovery, {
    key: "lead_recovery", score: leadRecovery ? 96 : 73,
    title: "Find the opportunities already being lost",
    why: "Ferocity can inspect open leads, stale conversations, missed calls, and unsold estimates, then prepare or run the permitted next step.",
    command: "Inspect my open and stale opportunities, rank the ones most likely to convert, and prepare the safest next action for each without sending anything yet.",
    href: "/app/leads"
  });

  const collections = mentions(command, ["invoice", "collect", "cash", "accounts receivable", "overdue", "unpaid", "who owes", "payment", "money owed"]);
  add(recommendations, setup || collections, {
    key: "cash_collection", score: collections ? 96 : 69,
    title: "Protect cash without creating customer friction",
    why: "Ferocity can find outstanding balances, preserve customer context, and prepare an approval-safe collection sequence.",
    command: "Show me outstanding invoices and collection risk. Prioritize the best next steps and prepare messages, but do not contact anyone without the required approval.",
    href: "/app/cash-collection"
  });

  const operations = mentions(command, ["job", "project", "work order", "schedule", "dispatch", "crew", "task", "delivery", "operations", "appointment", "deadline"]);
  add(recommendations, operations, {
    key: "jobs_operations", score: 95,
    title: "Coordinate the work, dependencies, and customer promise",
    why: "Ferocity can connect jobs or projects to schedules, tasks, people, materials, documents, updates, money, and exceptions.",
    command: "Inspect active work for schedule, dependency, staffing, customer, and money risks. Tell me what can move automatically and what needs a decision.",
    href: "/app/job-tracker"
  });

  const calls = mentions(command, ["call", "phone", "answering", "reception", "office", "voice", "appointment", "transfer to human"]);
  add(recommendations, calls, {
    key: "phone_office", score: 95,
    title: "Turn calls into handled business, not transcripts",
    why: "Ferocity can configure call coverage, qualification, scheduling, callbacks, context-aware follow-up, and human transfer rules.",
    command: "Review our phone coverage and design the right call handling, callback, appointment, and human-transfer rules. Do not buy a number or change routing without confirmation.",
    href: "/app/receptionist-setup"
  });

  const texting = mentions(command, ["text", "sms", "follow up", "remind", "review request", "customer message", "android", "scheduled message"]);
  add(recommendations, state.hasFerocityConnect && !state.hasPairedAndroidDevice && (setup || texting), {
    key: "ferocity_connect", score: texting ? 99 : 67,
    title: "Use the business Android phone for authorized texting",
    why: "Ferocity Connect is available, but no Android device is paired. It supports visible controls for approved reminders, follow-up, collections, replies, and scheduling.",
    command: "Help me pair our Android business phone with Ferocity Connect and explain the permissions, scheduled messaging, delivery evidence, and safety controls.",
    href: "/app/integrations/ferocity-connect"
  });

  const email = mentions(command, ["email", "inbox", "calendar", "meeting", "appointment", "reply", "correspondence"]);
  add(recommendations, email, {
    key: "email_calendar", score: 92,
    title: "Connect inbox and calendar context to the business",
    why: "Ferocity can triage communication, preserve customer and work context, prepare replies, coordinate appointments, and keep protected sends behind approval.",
    command: "Review my email and calendar workflow, identify what Ferocity can safely triage or prepare, and show me the minimum connection needed.",
    href: "/app/integrations"
  });

  const expenses = mentions(command, ["receipt", "expense", "bill", "statement", "tax", "cost", "margin", "warranty", "purchase", "invoice document"]);
  add(recommendations, state.hasExpenseIntelligence && !state.hasImportedExpenseDocuments && (setup || expenses), {
    key: "expense_intelligence", score: expenses ? 94 : 66,
    title: "Turn documents into traceable cost intelligence",
    why: "Receipt & Expense Intelligence is available but has not received a document. It can extract, match, deduplicate, preserve, and prepare allocations for review.",
    command: "Show me the easiest way to import receipts, bills, warranties, or statements and connect approved costs to the right work, asset, or overhead category.",
    href: "/app/expenses"
  });

  const people = mentions(command, ["employee", "worker", "team", "timesheet", "hours", "payroll", "credential", "availability", "labor", "crew"]);
  add(recommendations, people, {
    key: "workforce", score: 93,
    title: "Connect people, time, commitments, and work",
    why: "Ferocity can coordinate availability, assignments, hours, labor cost, credentials, handoffs, and payroll-ready records without turning employees into surveillance data.",
    command: "Inspect our workforce workflow for scheduling, hours, labor cost, credentials, and missed handoffs. Recommend the simplest improvements and preserve employee trust controls.",
    href: "/app/team"
  });

  const local = mentions(command, ["google business", "local seo", "maps", "customer review", "reviews", "reputation", "local search", "ranking", "service area"]);
  add(recommendations, setup || local, {
    key: "local_presence", score: local ? 93 : 63,
    title: "Strengthen local discovery and reputation",
    why: "Ferocity can find profile gaps, coordinate legitimate local content and review workflows, and connect discovery to leads and revenue where providers allow it.",
    command: "Audit our local presence, reviews, profile completeness, and attribution. Prioritize legitimate fixes and keep reputation-impacting changes behind approval.",
    href: "/app/local-presence"
  });

  const content = mentions(command, ["content", "post", "publish", "social", "video", "campaign", "seo", "advertis", "facebook", "instagram", "tiktok", "youtube", "reddit"]);
  add(recommendations, content, {
    key: "content_distribution", score: 92,
    title: "Create once, adapt by channel, and learn from revenue",
    why: "Ferocity can turn real business context into channel-appropriate drafts and coordinate approval, publishing, attribution, and learning without generic AI slop.",
    command: "Find the strongest current marketing opportunity, create channel-specific concepts from real business proof, and show the approval and distribution plan before publishing or spending.",
    href: "/app/growth"
  });

  const connections = mentions(command, ["connect", "integration", "provider", "account", "oauth", "facebook", "google", "tiktok", "quickbooks", "stripe", "tool"]);
  add(recommendations, connections, {
    key: "integrations", score: 89,
    title: "Connect the systems that hold the missing context",
    why: "Ferocity can identify which connection unlocks the requested outcome, show its real status, and guide the least technical authorization path.",
    command: "Tell me which connections are actually required for this outcome, which are already ready, and guide me through only the missing customer authorization steps.",
    href: "/app/integrations"
  });

  const attention = mentions(command, ["what next", "attention", "today", "priority", "check everything", "audit", "owner", "briefing", "status"]);
  add(recommendations, setup || attention, {
    key: "owner_attention", score: attention ? 91 : 75,
    title: "Show only what deserves owner attention",
    why: "Ferocity can combine signals across customers, work, people, money, and growth, advance authorized work, and return the decisions that still need judgment.",
    command: "Check the business across customers, work, people, money, and growth. Advance only already-authorized internal work and show me the few decisions or connections that need me.",
    href: "/app/ferocity"
  });

  return recommendations.sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, Math.min(limit, 4)))
    .map(({ score: _score, ...item }) => item);
}
