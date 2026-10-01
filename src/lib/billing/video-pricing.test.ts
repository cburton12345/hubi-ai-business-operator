import { afterEach, describe, expect, it } from "vitest";
import { quoteFinishedUgc, quoteManagedSourceRender } from "@/lib/billing/video-pricing";

const original = { ...process.env };

afterEach(() => {
  for (const key of ["VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND", "UGC_15_SECOND_PRICE_CENTS", "UGC_30_SECOND_PRICE_CENTS", "UGC_ADDITIONAL_VARIATION_PERCENT"] as const) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("video customer pricing", () => {
  it("quotes a model-neutral managed source render", () => {
    process.env.VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND = "25";
    expect(quoteManagedSourceRender(15).customerChargeCents).toBe(375);
  });

  it("quotes finished UGC packages and discounted additional variations", () => {
    process.env.UGC_15_SECOND_PRICE_CENTS = "1500";
    process.env.UGC_30_SECOND_PRICE_CENTS = "2500";
    process.env.UGC_ADDITIONAL_VARIATION_PERCENT = "40";
    expect(quoteFinishedUgc({ durationSeconds: 15 }).customerChargeCents).toBe(1500);
    expect(quoteFinishedUgc({ durationSeconds: 30, variations: 2 }).customerChargeCents).toBe(3500);
    expect(quoteFinishedUgc({ durationSeconds: 45 }).customerChargeCents).toBe(5000);
  });
});
