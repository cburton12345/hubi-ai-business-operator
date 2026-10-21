import { describe, expect, it, vi } from "vitest";
import { refreshDueProviderCredentialsForTenant } from "@/lib/integrations/credential-maintenance";

describe("refreshDueProviderCredentialsForTenant", () => {
  it("isolates provider failures and returns no access-token material", async () => {
    const recordOutcome = vi.fn().mockResolvedValue(undefined);
    const result = await refreshDueProviderCredentialsForTenant("tenant-1", {
      dependencies: {
        findDue: vi.fn().mockResolvedValue([
          { tenant_id: "tenant-1", provider_key: "google_ads" },
          { tenant_id: "tenant-1", provider_key: "microsoft_ads" },
        ]),
        refresh: vi
          .fn()
          .mockResolvedValueOnce("secret-access-token")
          .mockRejectedValueOnce(new Error("invalid_grant: consent revoked")),
        recordOutcome,
      },
    });

    expect(result).toEqual({
      checked: 2,
      refreshed: 1,
      failed: 1,
      outcomes: [
        { provider: "google_ads", status: "refreshed" },
        {
          provider: "microsoft_ads",
          status: "failed",
          reason: "reauthorization_required",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("secret-access-token");
    expect(recordOutcome).toHaveBeenCalledTimes(2);
  });

  it("keeps maintenance-metadata failures from aborting other providers", async () => {
    const result = await refreshDueProviderCredentialsForTenant("tenant-1", {
      dependencies: {
        findDue: vi.fn().mockResolvedValue([
          { tenant_id: "tenant-1", provider_key: "tiktok" },
        ]),
        refresh: vi.fn().mockResolvedValue("token"),
        recordOutcome: vi.fn().mockRejectedValue(new Error("database unavailable")),
      },
    });

    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(0);
  });
});
