import { describe, expect, it } from "vitest";
import { calculateImage25StandardListCost, IMAGE_25_STANDARD_RATE_VERSION, managedImageUsagePersistenceEvidence, sanitizeImageUsageEvidence } from "@/lib/providers/image-usage-cost";

function usage(text: number, imageOutput: number) {
  return {
    input_tokens: text,
    output_tokens: imageOutput,
    total_tokens: text + imageOutput,
    input_tokens_details: { text_tokens: text, image_tokens: 0 },
    output_tokens_details: { text_tokens: 0, image_tokens: imageOutput }
  };
}

const base = { model: "gpt-image-2.5-flare", rateVersion: IMAGE_25_STANDARD_RATE_VERSION, reservationCents: "25.0000" };

describe("Image 2.5 Standard list-cost parser", () => {
  it("serializes fractional cents exactly without floating point", () => {
    expect(calculateImage25StandardListCost({ ...base, usage: usage(1, 1) })).toMatchObject({ providerListCostCents: "0.0035", classification: "within_reservation", invoiceConfirmed: false, customerQuote: null });
  });

  it("handles large safe integer usage and detects reservation overruns", () => {
    expect(calculateImage25StandardListCost({ ...base, reservationCents: "1.0000", usage: usage(1_000_000, 1_000_000) })).toMatchObject({ providerListCostCents: "3500.0000", classification: "overrun" });
  });

  it("rejects missing, negative, fractional, and inconsistent token totals", () => {
    expect(calculateImage25StandardListCost({ ...base, usage: null }).reason).toBe("missing_usage");
    expect(calculateImage25StandardListCost({ ...base, usage: { ...usage(2, 3), input_tokens: -1 } }).reason).toBe("invalid_token_totals");
    expect(calculateImage25StandardListCost({ ...base, usage: { ...usage(2, 3), output_tokens: 1.5 } }).reason).toBe("invalid_token_totals");
    expect(calculateImage25StandardListCost({ ...base, usage: { ...usage(2, 3), total_tokens: 99 } }).reason).toBe("inconsistent_total_tokens");
  });

  it("treats missing or unexpected categories as unreconciled", () => {
    const missingOutput = usage(2, 3); delete (missingOutput as { output_tokens_details?: unknown }).output_tokens_details;
    expect(calculateImage25StandardListCost({ ...base, usage: missingOutput }).reason).toBe("ambiguous_output_categories");
    expect(calculateImage25StandardListCost({ ...base, usage: { ...usage(2, 3), input_tokens_details: { text_tokens: 2, image_tokens: 0, cached_tokens: 1 } } }).reason).toBe("ambiguous_input_categories");
    expect(calculateImage25StandardListCost({ ...base, usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5, input_tokens_details: { text_tokens: 1, image_tokens: 1 }, output_tokens_details: { text_tokens: 0, image_tokens: 3 } } }).reason).toBe("unexpected_image_input");
    expect(calculateImage25StandardListCost({ ...base, usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5, input_tokens_details: { text_tokens: 2, image_tokens: 0 }, output_tokens_details: { text_tokens: 1, image_tokens: 2 } } }).reason).toBe("unexpected_text_output");
  });

  it("requires the verified model, rate version, and numeric(14,4) reservation", () => {
    expect(calculateImage25StandardListCost({ ...base, model: "unknown", usage: usage(1, 1) }).reason).toBe("unsupported_model");
    expect(calculateImage25StandardListCost({ ...base, rateVersion: "old", usage: usage(1, 1) }).reason).toBe("rate_version_mismatch");
    expect(calculateImage25StandardListCost({ ...base, reservationCents: "1.00001", usage: usage(1, 1) }).reason).toBe("invalid_reservation");
  });

  it("whitelists bounded documented usage without retaining arbitrary provider JSON", () => {
    const evidence = sanitizeImageUsageEvidence({ ...usage(2, 3), secret: "discard-me", nested: { arbitrary: true } });
    expect(evidence).toEqual(usage(2, 3));
    expect(JSON.stringify(evidence)).not.toContain("discard-me");
    expect(sanitizeImageUsageEvidence({ ...usage(2, 3), total_tokens: 1_000_000_001 })).toBeNull();
    expect(sanitizeImageUsageEvidence({ ...usage(2, 3), input_tokens_details: { text_tokens: 2, image_tokens: 0, unknown_tokens: 1 } })).toBeNull();
  });

  it("persists invalid or missing provider usage only as unreconciled evidence", () => {
    const invalid = managedImageUsagePersistenceEvidence({ usage: { metadata: { providerUsageEvidence: { arbitrary: "payload" }, secret: "discard-me" }, providerCostCents: 0 }, model: "gpt-image-2.5-flare", size: "1024x1024" });
    expect(invalid).toMatchObject({ providerUsage: null, reconciliation: "unreconciled_usage" });
    expect(JSON.stringify(invalid)).not.toContain("discard-me");
    expect(JSON.stringify(invalid)).not.toContain("providerCostCents");
  });
});
