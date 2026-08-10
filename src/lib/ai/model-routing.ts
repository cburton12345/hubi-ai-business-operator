export type AiWorkloadTier = "economy" | "balanced" | "advanced";

const economyRunTypes = new Set([
  "receipt_vision_extraction"
]);

const balancedRunTypes = new Set([
  "construction_field_log",
  "owner_command_event_triage",
  "public_website_chat_reply",
  "setup_guidance",
  "weekly_marketing_plan"
]);

const advancedRunTypes = new Set([
  "adapter_factory_manifest",
  "growth_funnel_strategy"
]);

export function workloadTierForRunType(runType: string): AiWorkloadTier {
  if (economyRunTypes.has(runType)) return "economy";
  if (balancedRunTypes.has(runType)) return "balanced";
  if (advancedRunTypes.has(runType)) return "advanced";
  return "balanced";
}

export function managedModelForRunType(input: {
  runType: string;
  requestType: "json" | "vision_json";
}) {
  const fallback = process.env.AI_MODEL || "gpt-4.1-mini";
  if (input.requestType === "vision_json") {
    return process.env.AI_VISION_MODEL || process.env.AI_MODEL_ECONOMY || fallback;
  }

  const tier = workloadTierForRunType(input.runType);
  if (tier === "economy") return process.env.AI_MODEL_ECONOMY || fallback;
  if (tier === "advanced") return process.env.AI_MODEL_ADVANCED || fallback;
  return process.env.AI_MODEL_BALANCED || fallback;
}
