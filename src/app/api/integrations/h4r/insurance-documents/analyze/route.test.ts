import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), claim: vi.fn(), query: vi.fn(), analyze: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/integrations/h4r/request-auth", () => ({ verifyH4rSignedRequest: mocks.verify, claimH4rBridgeNonce: mocks.claim }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query, withPostgresTransactionResult: mocks.transaction }));
vi.mock("@/lib/document-intelligence/insurance-analysis", () => ({ analyzeInsuranceDocument: mocks.analyze }));
vi.mock("@/lib/env", () => ({ env: { H4R_DOCUMENT_ORIGIN: "https://example.supabase.co" } }));

import { POST } from "./route";

const body = { workspace_id: "00000000-0000-4000-8000-000000000001", document_id: "00000000-0000-4000-8000-000000000002", tenant_id: "00000000-0000-4000-8000-000000000003", file_name: "policy.pdf", mime_type: "application/pdf", byte_count: 3, sha256: "a".repeat(64), download_url: "https://example.supabase.co/storage/v1/object/sign/h4r-documents/private" };

describe("H4R insurance analysis route", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.verify.mockReturnValue({ ok: true, nonce: "n" }); mocks.claim.mockResolvedValue(true); });
  it("rejects an invalid signed body before analysis", async () => {
    const response = await POST(new Request("http://local", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("returns cached review-only evidence without downloading the source", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ferocity_tenant_id: "00000000-0000-4000-8000-000000000004" }] }).mockResolvedValueOnce({ rows: [{ document_id: "d", analysis_id: "a", primary_result_json: { facts: { insurer: "A" } }, review_status: "passed", deterministic_issues_json: [], disagreements_json: [] }] });
    const response = await POST(new Request("http://local", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ mode: "review_only", reused_existing: true, facts: { insurer: "A" }, independent_review: { humanReviewRequired: true } });
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
