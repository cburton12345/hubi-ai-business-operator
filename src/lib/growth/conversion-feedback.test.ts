import { describe, expect, it } from "vitest";
import { metaEventName } from "./conversion-feedback";

describe("conversion feedback mapping", () => {
  it("maps revenue milestones to stable Meta standard events", () => {
    expect(metaEventName("conversation_started")).toBe("Contact");
    expect(metaEventName("qualified_lead")).toBe("Lead");
    expect(metaEventName("appointment_booked")).toBe("Schedule");
    expect(metaEventName("payment_collected")).toBe("Purchase");
  });

  it("uses a safe generic event for future milestones", () => {
    expect(metaEventName("future_event")).toBe("Other");
  });
});
