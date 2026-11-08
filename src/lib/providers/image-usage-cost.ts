export const IMAGE_25_STANDARD_RATE_VERSION = "openai-image-2.5-standard-2026-10-22" as const;

const supportedModels = new Set(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]);
const maxNumericUnits = 99_999_999_999_999n; // numeric(14,4), expressed in 1/10,000 cent units.
const maxPersistedTokenCount = 1_000_000_000;

type UsageDetails = Record<string, unknown>;

export type ImageUsagePayload = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
  input_tokens_details?: UsageDetails;
  output_tokens_details?: UsageDetails;
};

export type ImageUsageCostResult = {
  model: string;
  rateVersion: typeof IMAGE_25_STANDARD_RATE_VERSION;
  reservationCents: string;
  providerListCostCents: string | null;
  classification: "within_reservation" | "overrun" | "unreconciled";
  reason: string | null;
  invoiceConfirmed: false;
  customerQuote: null;
};

function token(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedPersistedToken(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maxPersistedTokenCount ? value : null;
}

export function sanitizeImageUsageEvidence(value: unknown): ImageUsagePayload | null {
  const usage = record(value);
  const inputDetails = record(usage?.input_tokens_details);
  const outputDetails = record(usage?.output_tokens_details);
  if (!usage || !inputDetails || !outputDetails) return null;
  if (!exactDetail(inputDetails, ["text_tokens", "image_tokens"]) || !exactDetail(outputDetails, ["text_tokens", "image_tokens"])) return null;
  const inputTokens = boundedPersistedToken(usage.input_tokens);
  const outputTokens = boundedPersistedToken(usage.output_tokens);
  const totalTokens = boundedPersistedToken(usage.total_tokens);
  const inputText = boundedPersistedToken(inputDetails.text_tokens);
  const inputImage = boundedPersistedToken(inputDetails.image_tokens);
  const outputText = boundedPersistedToken(outputDetails.text_tokens);
  const outputImage = boundedPersistedToken(outputDetails.image_tokens);
  if ([inputTokens, outputTokens, totalTokens, inputText, inputImage, outputText, outputImage].some((part) => part === null)) return null;
  if (inputTokens! + outputTokens! !== totalTokens || inputText! + inputImage! !== inputTokens || outputText! + outputImage! !== outputTokens) return null;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    input_tokens_details: { text_tokens: inputText, image_tokens: inputImage },
    output_tokens_details: { text_tokens: outputText, image_tokens: outputImage }
  };
}

export function managedImageUsagePersistenceEvidence(input: { usage: unknown; model: string; size: string }) {
  const usage = record(input.usage);
  const metadata = record(usage?.metadata);
  const providerUsage = sanitizeImageUsageEvidence(metadata?.providerUsageEvidence);
  return {
    providerKey: "openai_image",
    featureKey: "managed_image_ad",
    unitType: "image",
    quantity: 1,
    model: input.model,
    size: input.size,
    providerUsage,
    reconciliation: providerUsage ? "pending_usage_cost" : "unreconciled_usage"
  } as const;
}

function decimalCentsToUnits(value: string) {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  return units <= maxNumericUnits ? units : null;
}

function unitsToDecimalCents(units: bigint) {
  const whole = units / 10_000n;
  const fraction = (units % 10_000n).toString().padStart(4, "0");
  return `${whole}.${fraction}`;
}

function unreconciled(model: string, reservationCents: string, reason: string): ImageUsageCostResult {
  return { model, rateVersion: IMAGE_25_STANDARD_RATE_VERSION, reservationCents, providerListCostCents: null, classification: "unreconciled", reason, invoiceConfirmed: false, customerQuote: null };
}

function exactDetail(details: UsageDetails | undefined, allowed: string[]) {
  if (!details) return false;
  return Object.keys(details).every((key) => allowed.includes(key)) && allowed.every((key) => key in details);
}

export function calculateImage25StandardListCost(input: {
  model: string;
  rateVersion: string;
  reservationCents: string;
  usage: ImageUsagePayload | null | undefined;
}): ImageUsageCostResult {
  const { model, reservationCents } = input;
  if (!supportedModels.has(model)) return unreconciled(model, reservationCents, "unsupported_model");
  if (input.rateVersion !== IMAGE_25_STANDARD_RATE_VERSION) return unreconciled(model, reservationCents, "rate_version_mismatch");
  const reservationUnits = decimalCentsToUnits(reservationCents);
  if (reservationUnits === null) return unreconciled(model, reservationCents, "invalid_reservation");
  if (!input.usage) return unreconciled(model, reservationCents, "missing_usage");

  const inputTokens = token(input.usage.input_tokens);
  const outputTokens = token(input.usage.output_tokens);
  const totalTokens = token(input.usage.total_tokens);
  if (inputTokens === null || outputTokens === null || totalTokens === null) return unreconciled(model, reservationCents, "invalid_token_totals");
  if (inputTokens + outputTokens !== totalTokens) return unreconciled(model, reservationCents, "inconsistent_total_tokens");
  if (!exactDetail(input.usage.input_tokens_details, ["text_tokens", "image_tokens"])) return unreconciled(model, reservationCents, "ambiguous_input_categories");
  if (!exactDetail(input.usage.output_tokens_details, ["text_tokens", "image_tokens"])) return unreconciled(model, reservationCents, "ambiguous_output_categories");

  const textInput = token(input.usage.input_tokens_details?.text_tokens);
  const imageInput = token(input.usage.input_tokens_details?.image_tokens);
  const textOutput = token(input.usage.output_tokens_details?.text_tokens);
  const imageOutput = token(input.usage.output_tokens_details?.image_tokens);
  if (textInput === null || imageInput === null || textOutput === null || imageOutput === null) return unreconciled(model, reservationCents, "invalid_usage_categories");
  if (textInput + imageInput !== inputTokens || textOutput + imageOutput !== outputTokens) return unreconciled(model, reservationCents, "inconsistent_usage_categories");
  if (imageInput !== 0n) return unreconciled(model, reservationCents, "unexpected_image_input");
  if (textOutput !== 0n) return unreconciled(model, reservationCents, "unexpected_text_output");

  // $5/M text input + $8/M image input + $30/M image output.
  // In cents this is exactly (5*text + 8*image + 30*output)/10,000.
  const providerCostUnits = 5n * textInput + 8n * imageInput + 30n * imageOutput;
  if (providerCostUnits > maxNumericUnits) return unreconciled(model, reservationCents, "cost_exceeds_numeric_precision");
  return {
    model,
    rateVersion: IMAGE_25_STANDARD_RATE_VERSION,
    reservationCents,
    providerListCostCents: unitsToDecimalCents(providerCostUnits),
    classification: providerCostUnits > reservationUnits ? "overrun" : "within_reservation",
    reason: null,
    invoiceConfirmed: false,
    customerQuote: null
  };
}
