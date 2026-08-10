import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres } = vi.hoisted(() => ({ queryPostgres: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));

import { evaluateVisitSchedule } from "@/lib/scheduling/evaluate-visit";

describe("evaluateVisitSchedule", () => {
  beforeEach(() => queryPostgres.mockReset());

  it("blocks dispatch when time and required crew are missing and warns about location", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{
        id: "visit-1",
        tenant_id: "tenant-1",
        scheduled_start: null,
        scheduled_end: null,
        required_crew_size: 1,
        required_skills_json: [],
        required_certifications_json: [],
        address_line1: null,
        latitude: null,
        longitude: null
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const conflicts = await evaluateVisitSchedule({ tenantId: "tenant-1", visitId: "visit-1", persist: false });
    expect(conflicts.map((conflict) => conflict.type)).toEqual(["missing_time", "location_missing", "crew_shortage"]);
    expect(conflicts.filter((conflict) => conflict.severity === "blocking")).toHaveLength(2);
  });

  it("blocks a visit whose end precedes its start", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{
        id: "visit-1",
        tenant_id: "tenant-1",
        scheduled_start: "2026-08-02T12:00:00Z",
        scheduled_end: "2026-08-02T11:00:00Z",
        required_crew_size: 0,
        required_skills_json: [],
        required_certifications_json: [],
        address_line1: "100 Test Way",
        latitude: null,
        longitude: null
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const conflicts = await evaluateVisitSchedule({ tenantId: "tenant-1", visitId: "visit-1", persist: false });
    expect(conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "invalid_time", severity: "blocking" })]));
  });
});
