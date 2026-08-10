import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { publicPlans } from "@/lib/billing/public-plans";
import { processRetellSalesCallbackTool } from "./retell-sales-callback";

function requestBody(args: Record<string, unknown>) {
  return JSON.stringify({
    name: "create_sales_callback",
    call: {
      call_id: "call_verified_123",
      agent_id: "agent_ferocity",
      to_number: "+17155550123",
      metadata: { ferocityBrandId: "22222222-2222-4222-8222-222222222206" }
    },
    args
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    resolveTenant: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
    resolveApiKey: vi.fn().mockResolvedValue("retell-api-key"),
    verifySignature: vi.fn().mockReturnValue(true),
    persist: vi.fn().mockResolvedValue({ id: "callback-request-1" }),
    ...overrides
  };
}

describe("verified Retell sales callbacks", () => {
  it("confirms a callback only after a real persisted record is returned", async () => {
    const deps = dependencies();
    const result = await processRetellSalesCallbackTool(
      requestBody({
        caller_name: "Chris Burton",
        callback_number: "+17153085984",
        reason: "Wants a Ferocity demo",
        urgency: "normal"
      }),
      "valid-signature",
      deps
    );

    expect(result).toMatchObject({ ok: true, status: "callback_requested", requestId: "callback-request-1" });
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({
      providerCallId: "call_verified_123",
      callerName: "Chris Burton",
      businessName: null,
      callbackNumber: "+17153085984"
    }));
    expect(result.message).toContain("Do not promise an exact callback time");
  });

  it("does not claim success when persistence fails", async () => {
    const result = await processRetellSalesCallbackTool(
      requestBody({ caller_name: "Chris", callback_number: "+17153085984", reason: "Sales question" }),
      "valid-signature",
      dependencies({ persist: vi.fn().mockRejectedValue(new Error("database unavailable")) })
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("not_recorded");
    expect(result.message).toContain("Do not say it is scheduled");
  });

  it("requires authenticated Retell requests and does not fabricate missing fields", async () => {
    const unauthenticated = await processRetellSalesCallbackTool(
      requestBody({ caller_name: "Chris", callback_number: "+17153085984", reason: "Sales question" }),
      "bad-signature",
      dependencies({ verifySignature: vi.fn().mockReturnValue(false) })
    );
    expect(unauthenticated.ok).toBe(false);

    const missingName = await processRetellSalesCallbackTool(
      requestBody({ callback_number: "+17153085984", reason: "Sales question" }),
      "valid-signature",
      dependencies()
    );
    expect(missingName.ok).toBe(false);
    expect(missingName.message).toContain("missing the caller's name");
  });

  it("keeps the live support prompt aligned with canonical plan prices and verified-action rules", () => {
    const script = fs.readFileSync(path.join(process.cwd(), "scripts", "configure-ferocity-retell.mjs"), "utf8");
    for (const plan of publicPlans) {
      expect(script).toContain(`${plan.name} at $${plan.priceCents / 100} per month`);
    }
    expect(script).toContain("Say the request is recorded only when the tool returns ok true");
    expect(script).toContain("Never invent a missing business name or contact detail");
    expect(script).toContain("Never promise an exact callback time");
    expect(script).toContain("create_sales_callback");
  });

  it("defines a database-level idempotency guard for one callback per Retell call", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "172_verified_retell_sales_callbacks.sql"),
      "utf8"
    );
    expect(migration).toContain("create unique index if not exists idx_operator_schedule_events_retell_callback");
    expect(migration).toContain("metadata_json->>'providerCallId'");
  });
});
