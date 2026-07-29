import { describe, expect, it } from "vitest";
import { decideCallHandling } from "./call-management";

const mode = {
  modeKey: "ai_first",
  displayName: "AI answers first",
  handlingStrategy: "ai_first" as const,
  transferCategories: ["emergency", "urgent", "sales_opportunity", "vip"] as const,
  minimumTransferScore: 70,
  minimumSalesValueCents: 2500000
};

describe("intelligent call management", () => {
  it("interrupts for an active roof leak and provides context", () => {
    const decision = decideCallHandling(
      { summary: "Existing customer reporting an active roof leak.", existingCustomer: true },
      { ...mode, transferCategories: [...mode.transferCategories] }
    );
    expect(decision.priorityClass).toBe("emergency");
    expect(decision.shouldInterruptOwner).toBe(true);
    expect(decision.callerContext).toContain("Existing customer");
  });

  it("protects a driving owner from routine scheduling calls", () => {
    const decision = decideCallHandling(
      { summary: "Caller wants to reschedule an appointment." },
      { ...mode, transferCategories: [...mode.transferCategories] },
      "driving"
    );
    expect(decision.decision).toBe("ai_handle");
    expect(decision.shouldInterruptOwner).toBe(false);
  });

  it("screens a high-value buyer for transfer", () => {
    const decision = decideCallHandling(
      { summary: "Customer is ready to buy and sign today.", estimatedValueCents: 4200000 },
      { ...mode, transferCategories: [...mode.transferCategories] }
    );
    expect(decision.priorityClass).toBe("sales_opportunity");
    expect(decision.decision).toBe("screen_then_transfer");
    expect(decision.callerContext).toContain("$42,000");
  });

  it("blocks spam without interrupting the owner", () => {
    const decision = decideCallHandling(
      { summary: "Likely telemarketer robocall." },
      { ...mode, transferCategories: [...mode.transferCategories] }
    );
    expect(decision.decision).toBe("block");
    expect(decision.shouldInterruptOwner).toBe(false);
  });

  it("honors a caller's no-AI preference", () => {
    const decision = decideCallHandling(
      { summary: "Existing customer calling about an appointment.", existingCustomer: true, aiAllowed: false },
      { ...mode, transferCategories: [...mode.transferCategories] }
    );
    expect(decision.decision).toBe("ring_owner");
    expect(decision.decisionReason).toContain("saved preference");
  });
});
