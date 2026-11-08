import { describe, expect, it, vi } from "vitest";
import { runApprovedImageGeneration, type ManagedImageDependencies, type ManagedImageJob } from "@/lib/marketing-os/image-generation-runtime";

const tenantId = "00000000-0000-0000-0000-000000000001";
const otherTenant = "00000000-0000-0000-0000-000000000002";
const job: ManagedImageJob = { id: "00000000-0000-0000-0000-000000000010", tenantId, brandId: null, status: "approved", prompt: "A truthful local service image advertisement.", size: "1024x1024", sourceAssets: [], approvalHash: "approved-hash", approvalVersion: "00000000-0000-4000-8000-000000000020", approvedByActorKey: "owner-1", approvedAt: "2026-10-22T00:00:00.000Z" };
const png = Uint8Array.from([137,80,78,71,13,10,26,10]).buffer;
function dependencies(overrides: Partial<ManagedImageDependencies> = {}): ManagedImageDependencies {
  return {
    configuration: { providerKey: "openai_image", model: "gpt-image-2.5-flare" },
    provider: { providerKey: "openai_image", createImage: vi.fn().mockResolvedValue({ ok: true, providerRequestId: "req_1", data: { imageBuffer: png, usage: { providerKey: "openai_image", featureKey: "managed_image_ad", unitType: "image", quantity: 1, providerCostCents: 10 } } }) },
    loadJob: vi.fn().mockResolvedValue(job), claimJob: vi.fn().mockResolvedValue(true), reserveBudget: vi.fn().mockResolvedValue({ id: "usage_1", idempotencyKey: `managed-image:${job.id}:openai_image` }), isCancelled: vi.fn().mockResolvedValue(false), approvalMatches: vi.fn().mockResolvedValue(true), storeOutput: vi.fn().mockResolvedValue({ assetId: "asset_1" }), markFailure: vi.fn(), ...overrides
  };
}
describe("managed image lifecycle", () => {
  it("persists an approved output and is idempotent once generated", async () => {
    const deps = dependencies();
    expect(await runApprovedImageGeneration({ tenantId, jobId: job.id }, deps)).toEqual({ status: "generated", assetId: "asset_1", idempotent: false });
    const again = dependencies({ loadJob: vi.fn().mockResolvedValue({ ...job, status: "generated", outputAssetId: "asset_1" }) });
    expect(await runApprovedImageGeneration({ tenantId, jobId: job.id }, again)).toEqual({ status: "generated", assetId: "asset_1", idempotent: true });
    expect(again.provider?.createImage).not.toHaveBeenCalled();
  });
  it("blocks unapproved, cross-tenant, missing configuration, budget, prompt, and asset requests", async () => {
    const denied = dependencies({ loadJob: vi.fn().mockResolvedValue({ ...job, status: "needs_review" }) });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, denied)).status).toBe("blocked");
    expect(denied.provider?.createImage).not.toHaveBeenCalled();
    const mutated = dependencies({ approvalMatches: vi.fn().mockResolvedValue(false) });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, mutated)).status).toBe("blocked");
    expect(mutated.provider?.createImage).not.toHaveBeenCalled();
    const forged = dependencies({ loadJob: vi.fn().mockResolvedValue({ ...job, approvedByActorKey: null }) });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, forged)).status).toBe("blocked");
    expect(forged.provider?.createImage).not.toHaveBeenCalled();
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, dependencies({ loadJob: vi.fn().mockResolvedValue({ ...job, tenantId: otherTenant }) }))).status).toBe("blocked");
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, dependencies({ configuration: null }))).status).toBe("blocked");
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, dependencies({ reserveBudget: vi.fn().mockResolvedValue(null) }))).status).toBe("blocked");
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, dependencies({ loadJob: vi.fn().mockResolvedValue({ ...job, prompt: "short" }) }))).status).toBe("blocked");
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, dependencies({ loadJob: vi.fn().mockResolvedValue({ ...job, sourceAssets: ["https://example.com/a.png"] }) }))).status).toBe("blocked");
  });
  it("keeps retryable provider and storage failures unknown and final provider errors failed", async () => {
    const timeout = dependencies({ provider: { providerKey: "openai_image", createImage: vi.fn().mockResolvedValue({ ok: false, errorCategory: "provider_timeout", safeMessage: "Outcome unknown.", retryable: true }) } });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, timeout)).status).toBe("unknown");
    expect(timeout.markFailure).toHaveBeenCalledWith(expect.objectContaining({ status: "unknown", voidReservation: false }));
    const rejected = dependencies({ provider: { providerKey: "openai_image", createImage: vi.fn().mockResolvedValue({ ok: false, errorCategory: "provider_moderation", safeMessage: "Rejected.", retryable: false }) } });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, rejected)).status).toBe("failed");
    const storage = dependencies({ storeOutput: vi.fn().mockRejectedValue(new Error("storage unavailable")) });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, storage)).status).toBe("unknown");
  });
  it("cannot claim a reapproved row with the stale loaded approval identity", async () => {
    const currentApproval = { hash: "approved-hash", version: "00000000-0000-4000-8000-000000000020" };
    const claimJob = vi.fn(async (loaded: ManagedImageJob) => loaded.approvalHash === currentApproval.hash && loaded.approvalVersion === currentApproval.version);
    currentApproval.hash = "replacement-hash";
    currentApproval.version = "00000000-0000-4000-8000-000000000021";
    const deps = dependencies({ claimJob });
    expect(await runApprovedImageGeneration({ tenantId, jobId: job.id }, deps)).toEqual({ status: "blocked", reason: "This image job is already processing or its approval changed." });
    expect(claimJob).toHaveBeenCalledWith(job);
    expect(deps.provider?.createImage).not.toHaveBeenCalled();
  });
  it("honors cancellation before and after provider completion", async () => {
    const before = dependencies({ isCancelled: vi.fn().mockResolvedValue(true) });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, before)).status).toBe("cancelled");
    expect(before.provider?.createImage).not.toHaveBeenCalled();
    expect(before.markFailure).toHaveBeenCalledWith(expect.objectContaining({ voidReservation: true }));
    const after = dependencies({ isCancelled: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) });
    expect((await runApprovedImageGeneration({ tenantId, jobId: job.id }, after)).status).toBe("cancelled");
    expect(after.storeOutput).not.toHaveBeenCalled();
  });
});
