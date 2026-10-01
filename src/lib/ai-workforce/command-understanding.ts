import { z } from "zod";
import { generateJsonWithAiService } from "@/lib/ai/ai-service";

export const ferocityCommandCapabilities = [
  "growth_revenue",
  "lead_follow_up",
  "collections",
  "marketing",
  "seo",
  "website",
  "reviews_proof",
  "jobs_estimates",
  "schedule_dispatch",
  "workforce_time",
  "reminders",
  "calls_office",
  "setup",
  "reporting_attention",
  "support_health"
] as const;

export type FerocityCommandCapability = (typeof ferocityCommandCapabilities)[number];

const understandingSchema = z.object({
  summary: z.string().trim().min(1).max(280),
  answer: z.string().trim().min(1).max(1600),
  nextSteps: z.array(z.string().trim().min(1).max(280)).max(5),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().trim().max(280).nullable(),
  requestedMode: z.enum(["read_only", "draft_preparation", "workspace_changing", "external"]),
  capabilities: z.array(z.enum(ferocityCommandCapabilities)).max(6),
  confidence: z.number().min(0).max(1)
});

export type FerocityCommandUnderstanding = z.infer<typeof understandingSchema>;

const capabilityKeywords: Record<FerocityCommandCapability, string> = {
  growth_revenue: "make more money revenue opportunities growth system",
  lead_follow_up: "follow up old lead stale estimate missed callback",
  collections: "invoice unpaid collect get paid faster",
  marketing: "marketing campaign content advertise",
  seo: "seo rank service page",
  website: "website homepage site",
  reviews_proof: "review testimonial proof completed job authority",
  jobs_estimates: "job estimate bid quote materials profit",
  schedule_dispatch: "schedule dispatch crew appointment",
  workforce_time: "worker hours timesheet payroll field cost",
  reminders: "remind reminder task",
  calls_office: "phone call office manager voice ai",
  setup: "set up setup business profile",
  reporting_attention: "report audit what needs attention check everything",
  support_health: "support health broken error issue"
};

const strongCapabilitySignals: Record<FerocityCommandCapability, string[]> = {
  growth_revenue: ["grow revenue", "grow collected", "make more money", "profit", "fill my schedule", "fill our schedule"],
  lead_follow_up: ["stale lead", "old lead", "lead follow", "unsold estimate", "missed opportunity"],
  collections: ["overdue", "unpaid", "who owes", "collection", "outstanding invoice"],
  marketing: ["marketing", "campaign", "advertis", "promotion", "content opportunity"],
  seo: ["seo", "search visibility", "rankings", "local search"],
  website: ["website", "homepage", "landing page", "web conversion"],
  reviews_proof: ["reviews", "review request", "testimonial", "case study", "customer proof", "completed work"],
  jobs_estimates: ["active job", "estimate", "bid", "quote", "scope", "materials"],
  schedule_dispatch: ["schedule", "dispatch", "assignment", "route conflict"],
  workforce_time: ["employee hours", "worker hours", "timesheet", "time record", "labor cost", "availability"],
  reminders: ["remind me", "reminder"],
  calls_office: ["phone", "call", "callback", "reception", "answering", "human transfer"],
  setup: ["set ferocity up", "set up ferocity", "setup ferocity", "configure ferocity", "onboard"],
  reporting_attention: ["owner attention", "needs attention", "check the whole business", "what next", "priority today"],
  support_health: ["broken", "degraded", "disconnected", "failing repeatedly", "system health"],
};

export function stronglySignaledCapabilities(command: string) {
  const normalized = command.toLowerCase();
  return ferocityCommandCapabilities.filter((capability) =>
    strongCapabilitySignals[capability].some((signal) => normalized.includes(signal))
  );
}

export function commandSearchText(command: string, capabilities: FerocityCommandCapability[]) {
  return `${command} ${capabilities.map((capability) => capabilityKeywords[capability]).join(" ")}`.trim();
}

export function fallbackCommandUnderstanding(command: string): FerocityCommandUnderstanding {
  return {
    summary: `I understood the request and will use the safest relevant Ferocity workflows: ${command.slice(0, 180)}`,
    answer: "I can inspect the connected business context and route this through the relevant Ferocity systems. I will distinguish between what I verified, what I prepared, and what still needs authorization.",
    nextSteps: [],
    needsClarification: false,
    clarifyingQuestion: null,
    requestedMode: "read_only",
    capabilities: [],
    confidence: 0.5
  };
}

export async function understandFerocityCommand(input: {
  tenantId: string;
  userId?: string | null;
  command: string;
  conversationContext?: string;
  businessContext?: string;
}) {
  const fallback = fallbackCommandUnderstanding(input.command);
  const raw = await generateJsonWithAiService({
    tenantId: input.tenantId,
    userId: input.userId,
    runType: "ferocity_command_understanding",
    system: `You are the reasoning and understanding layer for Ferocity, an AI business operating system. Interpret the owner's ordinary-language request across the whole business rather than forcing it into a contractor or marketing-only workflow. Use the supplied business and recent-conversation context. Map execution only to the supplied capability enum. Do not claim work happened. Do not invent records, integrations, provider access, results, or features. Clearly distinguish advice from inspected facts and executed work. Do not add sending, publishing, spending, charging, paying, deleting, or other consequential actions unless the owner explicitly requested them; protected execution still requires Ferocity's authority controls. Prefer a useful answer and concrete next steps over an intake interrogation. Ask one short clarifying question only when no safe useful answer or inspection is possible without it. Resolve pronouns, corrections, frustration, and short follow-ups from recent conversation. answer should directly answer the owner in natural language, using their industry and goal when known. nextSteps should contain zero to five specific, ordered actions appropriate to the request; never use generic filler. requestedMode must be read_only for questions/inspection, draft_preparation for creating safe drafts/plans, workspace_changing for explicit internal record or configuration changes, or external for explicit real-world sending/publishing/spending/payments. Return JSON with exactly: summary, answer, nextSteps, needsClarification, clarifyingQuestion (string or null), requestedMode, capabilities (array), confidence (0 to 1). Allowed capabilities: ${ferocityCommandCapabilities.join(", ")}.`,
    user: JSON.stringify({
      currentMessage: input.command,
      recentConversation: input.conversationContext?.slice(0, 4000) ?? "",
      businessContext: input.businessContext?.slice(0, 1200) ?? ""
    }),
    fallback,
    temperature: 0.2,
    timeoutMs: 12_000,
    metadata: { source: "ask_ferocity", commandLength: input.command.length }
  });

  const rawRecord = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const modelCapabilities = Array.isArray(rawRecord.capabilities)
    ? rawRecord.capabilities.filter((value): value is FerocityCommandCapability =>
        typeof value === "string" && ferocityCommandCapabilities.includes(value as FerocityCommandCapability)
      )
    : [];
  const parsed = understandingSchema.safeParse({
    ...rawRecord,
    capabilities: [...new Set([...stronglySignaledCapabilities(input.command), ...modelCapabilities])].slice(0, 6),
  });
  if (!parsed.success) return fallback;
  if (parsed.data.needsClarification && !parsed.data.clarifyingQuestion) return fallback;
  return parsed.data;
}
