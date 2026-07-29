import { describe, expect, it } from "vitest";
import { calculateManagedVoiceCharge } from "./managed-voice";

describe("managed voice pricing", () => {
  it("does not charge minutes within the included allowance", () => {
    expect(calculateManagedVoiceCharge({
      priorMinutes: 10,
      callMinutes: 5,
      includedMinutes: 25,
      unitPriceCents: 59
    })).toEqual({ billableMinutes: 0, customerChargeCents: 0 });
  });

  it("only charges the part of a call crossing the allowance", () => {
    expect(calculateManagedVoiceCharge({
      priorMinutes: 24,
      callMinutes: 3,
      includedMinutes: 25,
      unitPriceCents: 59
    })).toEqual({ billableMinutes: 2, customerChargeCents: 118 });
  });

  it("charges all minutes after the allowance is used", () => {
    expect(calculateManagedVoiceCharge({
      priorMinutes: 100,
      callMinutes: 4,
      includedMinutes: 100,
      unitPriceCents: 59
    })).toEqual({ billableMinutes: 4, customerChargeCents: 236 });
  });
});
