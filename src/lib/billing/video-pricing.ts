export type VideoPricingMode = "managed_source" | "finished_ugc";

export type VideoPriceQuote = {
  mode: VideoPricingMode;
  durationSeconds: number;
  customerChargeCents: number;
  label: string;
  includes: string[];
};

const DEFAULT_SOURCE_PRICE_CENTS_PER_SECOND = 25;
const DEFAULT_UGC_15_SECOND_PRICE_CENTS = 1500;
const DEFAULT_UGC_30_SECOND_PRICE_CENTS = 2500;
const DEFAULT_ADDITIONAL_UGC_VARIATION_PERCENT = 40;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function managedSourcePriceCentsPerSecond() {
  return positiveInteger(
    process.env.VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND,
    DEFAULT_SOURCE_PRICE_CENTS_PER_SECOND
  );
}

export function quoteManagedSourceRender(durationSeconds: number): VideoPriceQuote {
  const seconds = Math.max(1, Math.round(durationSeconds));
  return {
    mode: "managed_source",
    durationSeconds: seconds,
    customerChargeCents: seconds * managedSourcePriceCentsPerSecond(),
    label: "Managed source render",
    includes: [
      "provider generation",
      "automated quality inspection",
      "approved captions and brand overlays",
      "channel reframes from the approved source"
    ]
  };
}

export function quoteFinishedUgc(input: { durationSeconds: number; variations?: number }): VideoPriceQuote {
  const seconds = Math.max(1, Math.round(input.durationSeconds));
  const variations = Math.max(1, Math.round(input.variations ?? 1));
  const packageSeconds = seconds <= 15 ? 15 : 30;
  const packageCount = seconds <= 15 ? 1 : Math.ceil(seconds / packageSeconds);
  const packagePrice = packageSeconds === 15
    ? positiveInteger(process.env.UGC_15_SECOND_PRICE_CENTS, DEFAULT_UGC_15_SECOND_PRICE_CENTS)
    : positiveInteger(process.env.UGC_30_SECOND_PRICE_CENTS, DEFAULT_UGC_30_SECOND_PRICE_CENTS);
  const base = packagePrice * packageCount;
  const additionalPercent = positiveInteger(
    process.env.UGC_ADDITIONAL_VARIATION_PERCENT,
    DEFAULT_ADDITIONAL_UGC_VARIATION_PERCENT
  );
  const additional = Math.round(base * (additionalPercent / 100)) * Math.max(0, variations - 1);

  return {
    mode: "finished_ugc",
    durationSeconds: seconds,
    customerChargeCents: base + additional,
    label: `Up to ${packageSeconds * packageCount}-second finished UGC package`,
    includes: [
      "audience-led hook and script",
      "brand-grounded visual direction",
      "voice, captions, CTA, and final assembly",
      "one approved finished master"
    ]
  };
}

export const VIDEO_PRICING_NOTES = {
  sourceRender: "Source-render pricing is model-neutral to the customer. Ferocity selects the most appropriate approved provider inside the saved cost ceiling.",
  ugc: "UGC package pricing covers a finished marketing asset. Extra actors, languages, custom digital twins, or materially different concepts require a new quote.",
  failure: "A provider failure is never a completed customer charge."
} as const;
