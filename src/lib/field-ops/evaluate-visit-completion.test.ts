import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres } = vi.hoisted(() => ({ queryPostgres: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));

import { evaluateVisitCompletion } from "@/lib/field-ops/evaluate-visit-completion";

describe("evaluateVisitCompletion", () => {
  beforeEach(() => queryPostgres.mockReset());

  it("blocks completion for a rejected required form and missing customer signature", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{ id: "form-1", name: "Completion checklist", status: "rejected", required_for_completion: true }] })
      .mockResolvedValueOnce({ rows: [{ completion_requirements_json: ["customer_signature"] }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const result = await evaluateVisitCompletion({ tenantId: "tenant-1", visitId: "visit-1", persist: false });
    expect(result.ready).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.blockers.map((blocker) => blocker.type)).toEqual(["rejected_form", "required_signature"]);
  });

  it("allows completion when all requirements are satisfied", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ completion_requirements_json: ["customer_signature"] }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const result = await evaluateVisitCompletion({ tenantId: "tenant-1", visitId: "visit-1", persist: false });
    expect(result).toEqual({ ready: true, status: "ready", blockers: [] });
  });
});
