import { describe, expect, it } from "vitest";
import { evaluateGoldenLoop } from "@/lib/business-loop/golden-loop";
import { snapshotFromDatabaseRow, type RawLoopEvidence } from "@/lib/business-loop/sync-golden-loop";

function row(overrides: Partial<RawLoopEvidence> = {}): RawLoopEvidence {
  return {
    run_id: "run-1",
    mode: "observed",
    run_status: "active",
    lead_id: "lead-1",
    brand_id: "brand-1",
    customer_id: "customer-1",
    estimate_id: "estimate-1",
    estimate_status: "approved",
    job_id: "job-1",
    job_status: "completed",
    invoice_id: "invoice-1",
    invoice_status: "paid",
    payment_id: "payment-1",
    margin_record_id: "margin-1",
    review_id: "review-1",
    proof_output_id: "proof-1",
    growth_recommendation_id: "growth-1",
    lead_source: "google_ads",
    lead_status: "won",
    qualification_status: "qualified",
    lead_created_at: "2026-01-01T00:00:00.000Z",
    qualified_at: "2026-01-01T00:01:00.000Z",
    estimate_created_at: "2026-01-01T00:02:00.000Z",
    estimate_updated_at: "2026-01-01T00:03:00.000Z",
    scheduled_at: "2026-01-02T00:00:00.000Z",
    completed_at: "2026-01-03T00:00:00.000Z",
    invoice_created_at: "2026-01-03T01:00:00.000Z",
    payment_received_at: "2026-01-03T02:00:00.000Z",
    margin_recorded_at: "2026-01-03T02:01:00.000Z",
    review_created_at: "2026-01-03T03:00:00.000Z",
    proof_created_at: "2026-01-04T00:00:00.000Z",
    growth_created_at: "2026-01-04T01:00:00.000Z",
    ...overrides
  };
}

describe("golden loop database evidence", () => {
  it("certifies a fully evidenced lead-to-growth journey", () => {
    expect(evaluateGoldenLoop(snapshotFromDatabaseRow(row())).status).toBe("completed");
  });

  it("does not treat an unsent invoice draft as issued", () => {
    const result = evaluateGoldenLoop(snapshotFromDatabaseRow(row({ invoice_status: "draft" })));
    expect(result.currentStage).toBe("invoice_issued");
    expect(result.handoffGaps).toContain("payment_received");
  });

  it("requires an approved, attributable margin record after payment", () => {
    const result = evaluateGoldenLoop(snapshotFromDatabaseRow(row({ margin_record_id: null })));
    expect(result.currentStage).toBe("margin_recorded");
    expect(result.status).toBe("active");
  });
});
