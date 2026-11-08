import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn(), from: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/auth/api-permission", () => ({ authorizeApiPermission: mocks.authorize }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgresRequired: mocks.query }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ storage: { from: mocks.from } }) }));

import { GET } from "./route";

const tenantId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const location = `${tenantId}/${jobId}/${assetId}.png`;

function actor(userId = "44444444-4444-4444-8444-444444444444") {
  return { ok: true, actor: { userId, email: "actor@example.invalid", platformRole: userId === "admin-token" ? "super_admin" : "user", tenantRole: "owner", workspace: { id: tenantId, name: "Test", slug: "test", accountType: "customer", role: "owner" } } };
}

async function request(id = assetId) {
  return GET(new Request(`https://ferocity.live/api/marketing-assets/${id}`), { params: Promise.resolve({ assetId: id }) });
}

describe("managed image private asset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(actor());
    mocks.query.mockResolvedValue({ rows: [{ storage_bucket: "marketing-media-assets", storage_path: location, job_id: jobId }] });
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.invalid/signed" }, error: null });
    mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
  });

  it.each(["44444444-4444-4444-8444-444444444444", "admin-token"])("authorizes supported actor %s through the established permission boundary", async (userId) => {
    mocks.authorize.mockResolvedValue(actor(userId));
    const response = await request();
    expect(response.status).toBe(307);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("j.output_media_asset_id=a.id"), [tenantId, assetId], "marketing-asset-private-review");
    expect(mocks.from).toHaveBeenCalledWith("marketing-media-assets");
    expect(mocks.sign).toHaveBeenCalledWith(location, 300, { download: false });
  });

  it.each([
    ["wrong bucket", { storage_bucket: "private-customer-files", storage_path: location, job_id: jobId }],
    ["cross-tenant path", { storage_bucket: "marketing-media-assets", storage_path: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${jobId}/${assetId}.png`, job_id: jobId }],
    ["substituted job path", { storage_bucket: "marketing-media-assets", storage_path: `${tenantId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${assetId}.png`, job_id: jobId }]
  ])("rejects %s even when a mutable row is returned", async (_label, row) => {
    mocks.query.mockResolvedValue({ rows: [row] });
    expect((await request()).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before querying or signing", async () => {
    expect((await request("not-a-uuid")).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it.each([[401, "Authentication required."], [403, "Permission denied."]])("returns the actor-bound denial %s", async (status, message) => {
    mocks.authorize.mockResolvedValue({ ok: false, status });
    const response = await request();
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(message);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
