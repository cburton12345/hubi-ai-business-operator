import { describe, expect, it } from "vitest";
import { evaluateResendDailyQuota, isDeliverableRecipient } from "@/lib/email/resend";
import { isRoutableOwnerEmail } from "@/lib/ai-workforce/agent-workflows";

describe("Resend abuse containment", () => {
  it("stops application sends before the provider quota alert boundary", () => {
    expect(evaluateResendDailyQuota(69, 100)).toEqual({ allowed: true, stopAt: 70 });
    expect(evaluateResendDailyQuota(70, 100)).toEqual({ allowed: false, stopAt: 70 });
    expect(evaluateResendDailyQuota(80, 100)).toEqual({ allowed: false, stopAt: 70 });
    expect(evaluateResendDailyQuota(Number.NaN, 100)).toEqual({ allowed: false, stopAt: 0 });
  });

  it("rejects non-routable and reserved recipients before provider delivery", () => {
    expect(isDeliverableRecipient("owner@example.com")).toBe(false);
    expect(isDeliverableRecipient("admin@hubi.local")).toBe(false);
    expect(isDeliverableRecipient("nobody@invalid.test")).toBe(false);
    expect(isDeliverableRecipient("owner@ferocity.live")).toBe(true);
  });

  it("keeps owner alerts away from development-only addresses", () => {
    expect(isRoutableOwnerEmail("admin@hubi.local")).toBe(false);
    expect(isRoutableOwnerEmail("owner@ferocity.live")).toBe(true);
  });
});
