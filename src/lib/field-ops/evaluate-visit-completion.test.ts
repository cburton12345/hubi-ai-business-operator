import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres, withPostgresTransactionResult } = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  withPostgresTransactionResult: vi.fn()
}));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres, withPostgresTransactionResult }));

import { completeVisitAtomically, evaluateVisitCompletion } from "@/lib/field-ops/evaluate-visit-completion";

describe("evaluateVisitCompletion", () => {
  beforeEach(() => queryPostgres.mockReset());

  it("blocks completion for a rejected required form and missing customer signature", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{ id: "form-1", name: "Completion checklist", status: "rejected", required_for_completion: true }] })
      .mockResolvedValueOnce({ rows: [{ completion_requirements_json: ["customer_signature"] }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
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
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const result = await evaluateVisitCompletion({ tenantId: "tenant-1", visitId: "visit-1", persist: false });
    expect(result).toEqual({ ready: true, status: "ready", blockers: [] });
  });

  it("rechecks evidence and completes the visit, work order, and job inside one transaction", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        queries.push(text);
        if (text.includes("from public.service_visits") && text.includes("limit 1 for update")) {
          return { rows: [{ id: "visit-1", status: "in_progress", service_job_id: "job-1", work_order_id: "work-1" }], rowCount: 1 };
        }
        if (text.includes("from public.field_form_assignments")) return { rows: [], rowCount: 0 };
        if (text.includes("select wo.completion_requirements_json")) return { rows: [{ completion_requirements_json: [] }], rowCount: 1 };
        if (text.includes("update public.service_visits") && text.includes("status='completed'")) return { rows: [], rowCount: 1 };
        if (text.includes("count(*)::text")) return { rows: [{ count: "0" }], rowCount: 1 };
        if (text.includes("count(*)::text")) return { rows: [{ count: "0" }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      })
    };
    withPostgresTransactionResult.mockImplementation(async (operation) => ({ ok: true, value: await operation(client) }));

    const result = await completeVisitAtomically({ tenantId: "tenant-1", visitId: "visit-1" });

    expect(result.status).toBe("completed");
    expect(queries.some((text) => text.includes("completion_readiness_status"))).toBe(true);
    expect(queries.some((text) => text.includes("update public.service_jobs set status='completed'"))).toBe(true);
    expect(queries.some((text) => text.includes("update public.service_work_orders") && text.includes("status='completed'"))).toBe(true);
    expect(queries.some((text) => text.includes("\"atomic\":true"))).toBe(true);
  });

  it("blocks completion when time or material evidence remains open", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ completion_requirements_json: [] }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] });
    const result = await evaluateVisitCompletion({ tenantId: "tenant-1", visitId: "visit-1", persist: false });
    expect(result.blockers.map((blocker) => blocker.type)).toEqual(["open_time_entry", "unreviewed_material"]);
  });

  it("persists blockers without partially completing canonical work records", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        queries.push(text);
        if (text.includes("from public.service_visits") && text.includes("limit 1 for update")) {
          return { rows: [{ id: "visit-1", status: "in_progress", service_job_id: "job-1", work_order_id: "work-1" }], rowCount: 1 };
        }
        if (text.includes("from public.field_form_assignments")) {
          return { rows: [{ id: "form-1", name: "Completion", status: "required", required_for_completion: true }], rowCount: 1 };
        }
        if (text.includes("select wo.completion_requirements_json")) return { rows: [{ completion_requirements_json: [] }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      })
    };
    withPostgresTransactionResult.mockImplementation(async (operation) => ({ ok: true, value: await operation(client) }));

    const result = await completeVisitAtomically({ tenantId: "tenant-1", visitId: "visit-1" });

    expect(result.status).toBe("blocked");
    expect(queries.some((text) => text.includes("update public.service_jobs set status='completed'"))).toBe(false);
    expect(queries.some((text) => text.includes("update public.service_work_orders") && text.includes("status='completed'"))).toBe(false);
  });
});
