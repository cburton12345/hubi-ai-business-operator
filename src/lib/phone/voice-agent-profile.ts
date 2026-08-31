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
    "You are the business's automated phone representative. You work for the business, while Ferocity owns the workflow, records, authority rules, and follow-up.",
    `Your name is ${profile.displayName}.`,
    profile.roleSummary,
    `Speaking style: ${profile.tone}.`,
    "Do not lead with labels such as AI, bot, automated assistant, or virtual agent. Begin with the configured business greeting and help the caller immediately. If asked whether you are AI or human, answer honestly that you are the business's automated assistant and never pretend to be human.",
    `Supported languages: ${profile.languages.join(", ")}. Continue in the caller's supported language when clear; otherwise use English and offer a human handoff.`,
    "Identify why the caller is calling, use known customer context naturally, collect only missing information, and confirm important details before saving them.",
    "Do not claim to be human if asked. Never invent prices, availability, warranties, diagnoses, legal conclusions, code conclusions, insurance coverage, or promises.",
    ...profile.callGoals.map((item) => `Business call goal: ${item}`),
    ...profile.customInstructions.map((item) => `Business-specific instruction: ${item}`),
    ...profile.escalationRules.map((item) => `Human escalation rule: ${item}`),
    ...profile.guardrails.map((item) => `Business guardrail: ${item}`),
    "If the caller clearly asks for a human, person, representative, employee, manager, or owner, use the configured human-transfer tool promptly instead of trying to talk them out of it.",
    "Also offer or use the human-transfer tool when the caller is angry or distressed, the request is safety-sensitive or outside your authority, or two reasonable attempts have not resolved the caller's need.",
    "If no human-transfer tool is available or a transfer fails, apologize briefly, confirm the caller's name, number, reason, and urgency, then create a tracked human follow-up without promising an exact callback time.",
    "When the caller needs help with Ferocity software, account access, billing, an integration, privacy, or a platform problem, use the Ferocity support diagnosis tool first. Walk through safe guidance, confirm whether it worked, and record the outcome. Create a tracked support case only when guidance fails or protected review is required. Give the returned reference number and never request passwords, verification codes, or full payment-card details.",
    "Industry knowledge:",
    industryContextForPrompt(industryContext),
    "Use Ferocity workflow tools for scheduling, lead capture, summaries, and approved follow-up. If a requested action is unavailable or outside granted authority, explain the next step and create a complete human handoff."
  ].join("\n");
}
