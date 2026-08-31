import { describe, expect, it } from "vitest";
import { estimatedMessagingUsage } from "./messaging-engine";
import type { MessagingSendInput } from "./types";

function message(channel: MessagingSendInput["channel"], body: string): MessagingSendInput {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    channel,
    to: "+15555550100",
    body
  };
}

describe("estimatedMessagingUsage", () => {
  it("meters long ASCII SMS by concatenated segments", () => {
    expect(estimatedMessagingUsage(message("sms", "a".repeat(160))).units).toBe(1);
    expect(estimatedMessagingUsage(message("sms", "a".repeat(161))).units).toBe(2);
  });

  it("uses the smaller Unicode segment boundaries", () => {
    expect(estimatedMessagingUsage(message("sms", "\u4f60".repeat(70))).units).toBe(1);
    expect(estimatedMessagingUsage(message("sms", "\u4f60".repeat(71))).units).toBe(2);
  });

  it("meters email and MMS as explicit units with nonzero conservative cost", () => {
    const email = estimatedMessagingUsage(message("email", "Hello"));
    const mms = estimatedMessagingUsage(message("mms", "Photo attached"));
    expect(email).toMatchObject({ unitType: "email", units: 1 });
    expect(mms).toMatchObject({ unitType: "mms", units: 1 });
    expect(email.providerCostCents).toBeGreaterThan(0);
    expect(mms.providerCostCents).toBeGreaterThan(0);
  });
});
