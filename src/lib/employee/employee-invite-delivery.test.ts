import { describe, expect, it, vi } from "vitest";
import { attemptEmployeeInviteDelivery } from "./employee-invite-delivery";

describe("employee invitation delivery", () => {
  it("preserves confirmed provider success", async () => {
    await expect(attemptEmployeeInviteDelivery(async () => ({ ok: true, providerMessageId: "message-1" })))
      .resolves.toEqual({ ok: true, providerMessageId: "message-1" });
  });

  it("preserves a provider-declared failure for owner recovery", async () => {
    await expect(attemptEmployeeInviteDelivery(async () => ({ ok: false, skipped: true, error: "not configured" })))
      .resolves.toEqual({ ok: false, skipped: true, error: "not configured" });
  });

  it("normalizes a thrown delivery failure without exposing provider details", async () => {
    const operation = vi.fn(async () => { throw new Error("provider secret detail"); });
    await expect(attemptEmployeeInviteDelivery(operation))
      .resolves.toEqual({ ok: false, error: "Invitation delivery failed unexpectedly." });
    expect(operation).toHaveBeenCalledOnce();
  });
});
