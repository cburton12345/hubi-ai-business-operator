import { describe, expect, it } from "vitest";
import { ferocityCustomerModeFor, memoryCandidateIsSafe, normalizeFerocityReceipt } from "./conversation-runtime";

describe("Ask Ferocity customer mode", () => {
  it("treats Ferocity's own workspace as an operator even without billing", () => {
    expect(ferocityCustomerModeFor("internal", null)).toBe("internal_operator");
  });

  it.each(["active", "trialing", "manual"])("treats %s billing as an active customer", (status) => {
    expect(ferocityCustomerModeFor("customer", status)).toBe("active_customer");
  });

  it("does not silently treat an inactive workspace as paid", () => {
    expect(ferocityCustomerModeFor("customer", "cancelled")).toBe("prospect_or_inactive");
  });
});

describe("Ask Ferocity durable-memory safety", () => {
  it("accepts a grounded stable business fact", () => {
    expect(memoryCandidateIsSafe({
      kind: "business_fact",
      key: "primary service area",
      value: "Our primary service area is Eau Claire and Chippewa Falls",
      confidence: 0.97,
    }, "Remember that our primary service area is Eau Claire and Chippewa Falls.")).toBe(true);
  });

  it("rejects unsupported model-invented memory", () => {
    expect(memoryCandidateIsSafe({
      kind: "business_fact",
      key: "annual revenue",
      value: "Annual revenue is five million dollars",
      confidence: 0.99,
    }, "Help me improve our website.")).toBe(false);
  });

  it("rejects secrets even when explicitly present", () => {
    expect(memoryCandidateIsSafe({
      kind: "constraint",
      key: "api key",
      value: "Our API key is secret-example-value",
      confidence: 1,
    }, "Remember that our API key is secret-example-value.")).toBe(false);
  });
});

describe("Ask Ferocity result truth", () => {
  it("downgrades a completed mutation that lacks an authoritative target", () => {
    const result = normalizeFerocityReceipt({
      receiptKind: "workspace_change",
      title: "Updated customer",
      summary: "Claimed completion without a record reference.",
      status: "completed",
      href: "/app/customers",
    });
    expect(result.status).toBe("prepared");
    expect(result.evidence).toMatchObject({ completionDowngraded: true });
  });

  it("preserves completed status when the exact artifact is identified", () => {
    const result = normalizeFerocityReceipt({
      receiptKind: "result",
      title: "Verified report",
      summary: "The report exists.",
      status: "completed",
      href: "/app/reports/result-1",
      targetTable: "reports",
      targetId: "result-1",
    });
    expect(result.status).toBe("completed");
  });

  it("does not let a model fallback create a completed-looking result", () => {
    const result = normalizeFerocityReceipt({
      receiptKind: "result",
      title: "Command result",
      summary: "A safe fallback was returned.",
      status: "completed",
      href: "/app/ai-workforce/results/run-1",
      targetTable: "ai_command_runs",
      targetId: "run-1",
      evidence: { planningAiStatus: "fallback", responseAiStatus: "fallback" },
    });
    expect(result.status).toBe("prepared");
    expect(result.evidence).toMatchObject({ completionDowngradeReason: "execution_prepared" });
  });

  it("preserves a verified completed action even when explanatory AI used fallback", () => {
    const result = normalizeFerocityReceipt({
      receiptKind: "result",
      title: "Verified reminder",
      summary: "The reminder record exists.",
      status: "completed",
      href: "/app/ai-workforce/results/run-2",
      targetTable: "ai_command_runs",
      targetId: "run-2",
      evidence: { planningAiStatus: "fallback", verifiedCompletedActionCount: 1 },
    });
    expect(result.status).toBe("completed");
  });

  it("marks an explicitly failed provider-backed result as failed", () => {
    const result = normalizeFerocityReceipt({
      receiptKind: "external",
      title: "Provider action",
      summary: "Provider rejected the request.",
      status: "completed",
      href: "/app/integrations/job-1",
      targetTable: "integration_jobs",
      targetId: "job-1",
      evidence: { providerStatus: "failed" },
    });
    expect(result.status).toBe("failed");
  });
});
