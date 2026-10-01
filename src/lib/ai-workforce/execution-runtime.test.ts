import { describe, expect, it, vi } from "vitest";
import { executeWorkforceRuntime } from "@/lib/ai-workforce/execution-runtime";

describe("replaceable AI workforce runtime", () => {
  const context = { tenantId: "tenant", workflowId: "workflow", runId: "run", departmentKey: "sales_follow_up" };

  it("runs today's native department implementation behind a runtime contract", async () => {
    const nativeExecute = vi.fn(async () => ({ summary: "Prepared follow-up." }));
    await expect(executeWorkforceRuntime({ context, nativeExecute })).resolves.toEqual({
      runtimeKey: "ferocity_native",
      result: { summary: "Prepared follow-up." }
    });
    expect(nativeExecute).toHaveBeenCalledOnce();
  });

  it("does not silently send business authority to an unactivated external runtime", async () => {
    await expect(executeWorkforceRuntime({ runtimeKey: "connected_agent", context, nativeExecute: async () => ({}) }))
      .rejects.toThrow("not activated");
  });
});
