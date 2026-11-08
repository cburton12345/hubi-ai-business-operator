import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("@/lib/auth/require-permission", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => null }));
vi.mock("@/lib/workspace/current-workspace", () => ({ getCurrentWorkspaceId: async () => "tenant-1" }));
vi.mock("@/lib/auth/session", () => ({ getCurrentAppSession: async () => ({ userId: "user-1" }) }));
vi.mock("@/lib/growth/growth-events", () => ({ recordGrowthEvent: vi.fn() }));
vi.mock("@/lib/reliability/capability-runtime", () => ({ recordCapabilityCorrection: vi.fn() }));
vi.mock("@/lib/onboarding/customer-onboarding", () => ({ syncCustomerOnboardingForTenant: vi.fn() }));

import { decideApproval } from "@/app/app/approvals/actions";
import { updateServiceControlAction } from "@/app/app/controls/actions";

describe("server-owned authority and evidence write paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.invalid",
      workspace: { id: "tenant-1" },
    });
    mocks.queryPostgres.mockResolvedValue({ rows: [] });
  });

  it("records an authorized approval decision and activity evidence through the server database path", async () => {
    mocks.queryPostgres.mockImplementation(async (sql: string) => {
      if (sql.includes("select risk_level from public.approvals")) {
        return { rows: [{ risk_level: "high" }] };
      }
      if (sql.includes("update public.approvals")) {
        return { rows: [{
          id: "approval-1",
          tenant_id: "tenant-1",
          brand_id: "brand-1",
          target_type: "page_change",
          target_id: "target-1",
          risk_level: "high",
        }] };
      }
      return { rows: [] };
    });

    const form = new FormData();
    form.set("approvalId", "approval-1");
    form.set("decision", "approved");
    form.set("notes", "Reviewed exact change");
    await decideApproval(form);

    expect(mocks.requirePermission).toHaveBeenCalledWith("approval:review_high");
    expect(mocks.queryPostgres.mock.calls.some(([sql]) => String(sql).includes("update public.approvals"))).toBe(true);
    expect(mocks.queryPostgres.mock.calls.some(([sql]) => String(sql).includes("insert into public.activity_logs"))).toBe(true);
  });

  it("updates service authority and its timeline evidence through permission-checked server SQL", async () => {
    const form = new FormData();
    form.set("featureKey", "email_send");
    form.set("mode", "review_required");
    form.set("usageLimit", "25");
    form.set("overagePolicy", "allow_with_review");
    await updateServiceControlAction(form);

    expect(mocks.requirePermission).toHaveBeenCalledWith("tenant:manage");
    expect(mocks.queryPostgres.mock.calls.some(([sql]) => String(sql).includes("update public.workspace_feature_entitlements"))).toBe(true);
    expect(mocks.queryPostgres.mock.calls.some(([sql]) => String(sql).includes("update public.live_action_policies"))).toBe(true);
    expect(mocks.queryPostgres.mock.calls.some(([sql]) => String(sql).includes("insert into public.operator_timeline_events"))).toBe(true);
  });
});
