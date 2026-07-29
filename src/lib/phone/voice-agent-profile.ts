import {
  industryContextForPrompt,
  type IndustryKnowledgeContext
} from "@/lib/industry-knowledge/get-industry-context";

export type VoiceAgentBusinessProfile = {
  displayName: string;
  roleSummary: string;
  tone: string;
  greeting: string;
  languages: string[];
  callGoals: string[];
  customInstructions: string[];
  escalationRules: string[];
  guardrails: string[];
};

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function linesFromText(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|;/)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function voiceProfileFromStored(input: {
  displayName: string;
  roleSummary: string;
  tone: string;
  escalationRules: unknown;
  guardrails: unknown;
  metadata: unknown;
}): VoiceAgentBusinessProfile {
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown>
    : {};

  return {
    displayName: input.displayName,
    roleSummary: input.roleSummary,
    tone: input.tone,
    greeting: typeof metadata.voiceGreeting === "string" && metadata.voiceGreeting.trim()
      ? metadata.voiceGreeting.trim()
      : "Thank you for calling. How can I help you today?",
    languages: cleanList(metadata.voiceLanguages).length
      ? cleanList(metadata.voiceLanguages)
      : ["English"],
    callGoals: cleanList(metadata.voiceCallGoals),
    customInstructions: cleanList(metadata.voiceCustomInstructions),
    escalationRules: cleanList(input.escalationRules),
    guardrails: cleanList(input.guardrails)
  };
}

export function buildVoiceAgentSystemPrompt(
  profile: VoiceAgentBusinessProfile,
  industryContext: IndustryKnowledgeContext | null
) {
  return [
    "You are the business's AI phone representative. You work for the business, while Ferocity owns the workflow, records, authority rules, and follow-up.",
    `Your name is ${profile.displayName}.`,
    profile.roleSummary,
    `Speaking style: ${profile.tone}.`,
    `Supported languages: ${profile.languages.join(", ")}. Continue in the caller's supported language when clear; otherwise use English and offer a human handoff.`,
    "Identify why the caller is calling, use known customer context naturally, collect only missing information, and confirm important details before saving them.",
    "Do not claim to be human if asked. Never invent prices, availability, warranties, diagnoses, legal conclusions, code conclusions, insurance coverage, or promises.",
    ...profile.callGoals.map((item) => `Business call goal: ${item}`),
    ...profile.customInstructions.map((item) => `Business-specific instruction: ${item}`),
    ...profile.escalationRules.map((item) => `Human escalation rule: ${item}`),
    ...profile.guardrails.map((item) => `Business guardrail: ${item}`),
    "Industry knowledge:",
    industryContextForPrompt(industryContext),
    "Use Ferocity workflow tools for scheduling, lead capture, summaries, and approved follow-up. If a requested action is unavailable or outside granted authority, explain the next step and create a complete human handoff."
  ].join("\n");
}
