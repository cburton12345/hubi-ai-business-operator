import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  claim: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/document-intelligence/lease-analysis", () => ({ analyzeLeaseDocument: mocks.analyze }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query, withPostgresTransactionResult: mocks.transaction }));
vi.mock("@/lib/integrations/h4r/request-auth", () => ({ claimH4rBridgeNonce: mocks.claim, verifyH4rSignedRequest: mocks.verify }));
vi.mock("@/lib/env", () => ({ env: { H4R_DOCUMENT_ORIGIN: "https://h4r.example.test", H4R_SMS_BRIDGE_SECRET: "test-secret-long-enough-123456" } }));

import { POST } from "./route";

const bytes = new TextEncoder().encode("%PDF-test-lease");
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const body = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  document_id: "22222222-2222-4222-8222-222222222222",
  lease_id: null,
  file_name: "lease.pdf",
  mime_type: "application/pdf",
  byte_count: bytes.byteLength,
  sha256: hash,
  download_url: "https://h4r.example.test/storage/v1/object/sign/h4r-documents/workspace/lease.pdf?token=private",
};

describe("H4R lease analysis route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.query.mockReset();
    mocks.verify.mockReturnValue({ ok: true, nonce: "nonce" });
    mocks.claim.mockResolvedValue(true);
    mocks.query
      .mockResolvedValueOnce({ rows: [{ ferocity_tenant_id: "33333333-3333-4333-8333-333333333333", status: "review" }] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.transaction.mockResolvedValue({ ok: true, value: { documentId: "d", analysisId: "a" } });
    mocks.analyze.mockResolvedValue({
      primary: { terms: {}, fields: [], clauseSummaries: [], sourceCoverage: {}, overallConfidence: 0.8, reviewReasons: [] },
      reviewer: null,
      review: { status: "reviewer_unavailable", deterministicIssues: [], disagreements: [], humanReviewRequired: true },
      reviewerAvailable: false,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { status: 200, headers: { "content-length": String(bytes.byteLength) } })));
  });

  it("rejects a signed URL outside the configured private H4R origin", async () => {
    const response = await POST(new Request("https://ferocity.test/api", { method: "POST", body: JSON.stringify({ ...body, download_url: "https://attacker.example/storage/v1/object/sign/h4r-documents/a" }) }));
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("rejects a source whose bytes do not match H4R's checksum", async () => {
    const response = await POST(new Request("https://ferocity.test/api", { method: "POST", body: JSON.stringify({ ...body, sha256: "0".repeat(64) }) }));
    expect(response.status).toBe(422);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("returns review-only results and never accepts, sends, or signs fields", async () => {
    const response = await POST(new Request("https://ferocity.test/api", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, mode: "review_only", warnings: expect.arrayContaining([expect.stringContaining("No field was accepted")]) });
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "application/pdf", fileBytes: expect.any(Uint8Array) }));
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("reuses a completed checksum-matched analysis without downloading or spending AI usage", async () => {
    mocks.query.mockReset()
      .mockResolvedValueOnce({ rows: [{ ferocity_tenant_id: "33333333-3333-4333-8333-333333333333", status: "review" }] })
      .mockResolvedValueOnce({ rows: [{
        document_id: "d", analysis_id: "a", primary_result_json: { terms: { monthlyRentCents: 125000 }, fields: [] },
        status: "needs_review", review_status: "reviewer_unavailable", deterministic_issues_json: [], disagreements_json: [],
      }] });
    const response = await POST(new Request("https://ferocity.test/api", { method: "POST", body: JSON.stringify(body) }));
    expect(await response.json()).toMatchObject({ ok: true, reused_existing: true, independent_review: { status: "reviewer_unavailable" } });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
