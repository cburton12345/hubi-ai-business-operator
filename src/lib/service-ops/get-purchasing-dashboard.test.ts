import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres } = vi.hoisted(() => ({ queryPostgres: vi.fn() }));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));
vi.mock("@/lib/workspace/current-workspace", () => ({
  getCurrentWorkspaceId: () => Promise.resolve("11111111-1111-4111-8111-111111111111"),
}));

import {
  getPurchasingDashboard,
  PurchasingDashboardUnavailableError,
} from "./get-purchasing-dashboard";

describe("getPurchasingDashboard", () => {
  beforeEach(() => queryPostgres.mockReset());

  it("fails closed instead of translating a database failure into empty purchasing records", async () => {
    queryPostgres.mockResolvedValue(null);

    await expect(getPurchasingDashboard()).rejects.toBeInstanceOf(
      PurchasingDashboardUnavailableError,
    );
    expect(queryPostgres).toHaveBeenCalledTimes(9);
  });
});
