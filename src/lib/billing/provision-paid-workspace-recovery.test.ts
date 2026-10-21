import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  withPostgresTransactionResult: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => dbMocks);
vi.mock("@/lib/ai-workforce/agent-workflows", () => ({ ensureDefaultAgentWorkflows: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({
  hashSessionToken: vi.fn((value: string) => `hash:${value}`),
  randomSessionToken: vi.fn(() => "abcdef1234567890")
}));
vi.mock("@/lib/email/transactional", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { FEROCITY_APP_URL: "https://ferocity.test" } }));
vi.mock("@/lib/observability/platform-admin-alerts", () => ({ raisePlatformAdminAlert: vi.fn() }));
vi.mock("@/lib/push/preferences", () => ({
  getDefaultPushNotificationPreferences: vi.fn(() => ({})),
  upsertPushNotificationPreferences: vi.fn()
}));
vi.mock("@/lib/billing/apply-plan-entitlements", () => ({ inheritedServiceFeaturesForPlan: vi.fn(() => []) }));
vi.mock("@/lib/onboarding/customer-onboarding", () => ({ syncCustomerOnboardingForTenant: vi.fn() }));

import { resolveProvisionTarget } from "@/lib/billing/provision-paid-workspace";

type QueryResult = { rows: Array<Record<string, unknown>>; rowCount?: number };

describe("paid workspace provisioning checkpoint recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses the checkpointed customer workspace after a failure instead of creating another tenant", async () => {
    const requestState: { status: string; metadata_json: Record<string, unknown> } = {
      status: "reviewing",
      metadata_json: {}
    };
    const workspaces = new Map<string, string>();
    let createdTenantCount = 0;

    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []): Promise<QueryResult> => {
        const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
        if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
        if (normalized.includes("from public.access_requests") && normalized.includes("for update")) {
          return { rows: [{ ...requestState }] };
        }
        if (normalized.includes("from public.billing_subscriptions")) return { rows: [] };
        if (normalized.includes("from public.tenants") && normalized.includes("where id = $1")) {
          const id = String(values[0]);
          const slug = workspaces.get(id);
          return { rows: slug ? [{ id, slug }] : [] };
        }
        if (normalized.includes("from public.users")) return { rows: [] };
        if (normalized.includes("from public.workspace_invites")) return { rows: [] };
        if (normalized.includes("insert into public.tenants")) {
          createdTenantCount += 1;
          const id = "11111111-1111-4111-8111-111111111111";
          workspaces.set(id, String(values[1]));
          return { rows: [{ id }] };
        }
        if (normalized.startsWith("update public.access_requests")) {
          requestState.status = "reviewing";
          requestState.metadata_json = {
            ...requestState.metadata_json,
            ...(JSON.parse(String(values[2])) as Record<string, unknown>)
          };
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected SQL in recovery test: ${normalized}`);
      })
    };

    dbMocks.withPostgresTransactionResult.mockImplementation(async (operation) => {
      try {
        return { ok: true, value: await operation(client) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
      }
    });

    const input = {
      accessRequestId: "22222222-2222-4222-8222-222222222222",
      email: "owner@example.com",
      companyName: "Example Service",
      planKey: "operator" as const,
      stripeEventId: "evt_paid",
      checkoutSessionId: "cs_paid",
      customerId: "cus_paid",
      subscriptionId: "sub_paid"
    };

    const firstAttempt = await resolveProvisionTarget(input);
    expect(firstAttempt.ensureFoundation).toBe(true);
    expect(requestState.metadata_json.checkoutStatus).toBe("provisioning");

    // Simulate a crash immediately after the durable checkpoint and a Stripe retry.
    const retry = await resolveProvisionTarget({ ...input, stripeEventId: "evt_paid_retry" });

    expect(retry.tenantId).toBe(firstAttempt.tenantId);
    expect(retry.workspaceSlug).toBe(firstAttempt.workspaceSlug);
    expect(createdTenantCount).toBe(1);
    expect(client.query.mock.calls.filter(([sql]) => String(sql).includes("pg_advisory_xact_lock"))).toHaveLength(2);
  });
});
