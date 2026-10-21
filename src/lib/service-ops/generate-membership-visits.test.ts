import { beforeEach, describe, expect, it, vi } from "vitest";

const queryPostgres = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));

import { generateDueMembershipVisits } from "@/lib/service-ops/generate-membership-visits";

describe("generateDueMembershipVisits", () => {
  beforeEach(() => queryPostgres.mockReset());

  it("renews eligible memberships before generating bounded idempotent visits", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ recurring_plan_id: "plan-1", work_order_id: "work-1", visit_id: "visit-1", scheduled_for: new Date("2026-10-20") }] });
    const result = await generateDueMembershipVisits("tenant-1", "customer-1");
    expect(result).toHaveLength(1);
    expect(queryPostgres.mock.calls[0][0]).toContain("visits_remaining=program.visits_per_year");
    expect(queryPostgres.mock.calls[1][0]).toContain("p.visits_remaining is null or p.visits_remaining > 0");
    expect(queryPostgres.mock.calls[1][0]).toContain("on conflict (tenant_id, external_key)");
  });
});
