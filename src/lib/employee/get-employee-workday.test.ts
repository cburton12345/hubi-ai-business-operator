import { beforeEach,describe,expect,it,vi } from "vitest";

const { accessMock,queryMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  queryMock: vi.fn()
}));

vi.mock("@/lib/employee/employee-access",() => ({ getEmployeeAccessContext: accessMock }));
vi.mock("@/lib/db/postgres",() => ({ queryPostgresRequired: queryMock }));

import { getEmployeeWorkday } from "./get-employee-workday";

const ownAccess = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  workerId: "00000000-0000-4000-8000-000000000003",
  workerName: "Synthetic Worker"
};

describe("employee workday pay-preview boundary",() => {
  beforeEach(() => {
    accessMock.mockReset();
    queryMock.mockReset();
    accessMock.mockResolvedValue(ownAccess);
    queryMock.mockResolvedValue({ rows: [],rowCount: 0 });
  });

  it("binds every workday and pay-preview query to the authenticated tenant and worker",async () => {
    await getEmployeeWorkday();
    expect(queryMock).toHaveBeenCalledTimes(7);
    for (const [sql,parameters] of queryMock.mock.calls) {
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
      expect(parameters).toEqual([ownAccess.tenantId,ownAccess.workerId]);
    }
    const payPreviewSql = String(queryMock.mock.calls[6][0]);
    expect(payPreviewSql).toContain("worker.tenant_id=$1 and worker.id=$2");
    expect(payPreviewSql).toContain("advance.tenant_id=$1 and advance.worker_id=$2");
  });

  it("does not accept a caller-selected worker and cannot query a foreign worker",async () => {
    const foreignWorkerId = "00000000-0000-4000-8000-000000000099";
    await getEmployeeWorkday();
    expect(queryMock.mock.calls.flatMap((call) => call[1] as unknown[])).not.toContain(foreignWorkerId);
    expect(queryMock.mock.calls.every((call) => call[1]?.[1] === ownAccess.workerId)).toBe(true);
  });

  it("returns an empty workday without querying payroll or operations when no worker is linked",async () => {
    accessMock.mockResolvedValue({ ...ownAccess,workerId: null });
    const result = await getEmployeeWorkday();
    expect(queryMock).not.toHaveBeenCalled();
    expect(result.payBalance.grossEstimate).toBe("$0.00");
    expect(result.assignments).toEqual([]);
  });
});
