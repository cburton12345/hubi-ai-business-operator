import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const { queryPostgresMock, withPostgresTransactionMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  withPostgresTransactionMock: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: queryPostgresMock,
  withPostgresTransaction: withPostgresTransactionMock
}));

import { evaluateVoiceAccess, recordVoiceUsage } from "./managed-voice";

const accessRow = {
  account_status: "connected",
  credentials_status: "configured",
  live_actions_enabled: false,
  ownership_mode: "ferocity_managed",
  tenant_status: "active",
  account_type: "customer",
  plan_key: "starter",
  subscription_status: "active",
  subscription_metadata: {},
  allowance_policy_id: "policy-1",
  included_quantity: 25,
  hard_limit_quantity: null,
  overage_unit_price_cents: 25,
  policy_metadata: { disclosedOverage: true, autoBillDisclosedOverage: true },
  monthly_minutes: 0,
  monthly_provider_cost_cents: 0,
  monthly_all_provider_cost_cents: 0,
  sponsorship_status: null,
  sponsored_provider_cost_cap_cents: null,
  monthly_customer_charge_cents: 0,
  active_calls: 0,
  monthly_provider_cost_cap_cents: 10_000,
  monthly_customer_charge_cap_cents: null,
  concurrent_call_limit: 2,
  max_call_duration_seconds: 1_200,
  emergency_paused: false,
  failed_payment_behavior: "take_message_only",
  global_emergency_paused: false,
  global_active_calls: 0,
  global_monthly_provider_cost_cents: 0,
  global_provider_cost_cap_cents: 50_000,
  global_concurrent_call_limit: 20
};

const usageInput = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  providerKey: "retell_voice",
  providerCallId: "provider-call-1",
  callId: "10000000-0000-0000-0000-000000000001",
  durationSeconds: 120,
  providerCostCents: 17
};

beforeEach(() => {
  queryPostgresMock.mockReset();
  withPostgresTransactionMock.mockReset();
  withPostgresTransactionMock.mockImplementation(async (operation) => {
    return operation({ query: queryPostgresMock });
  });
});
describe("managed voice application admission", () => {
  it("runs authorized test calls through emergency and pricing controls", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{ ...accessRow, global_emergency_paused: true }] });
    await expect(evaluateVoiceAccess({
      tenantId: usageInput.tenantId,
      providerKey: usageInput.providerKey,
      purpose: "authorized_test",
      callDirection: "outbound"
    })).resolves.toEqual(expect.objectContaining({ allowed: false, errorCategory: "emergency_pause" }));

    queryPostgresMock.mockResolvedValueOnce({ rows: [{ ...accessRow, allowance_policy_id: null }] });
    await expect(evaluateVoiceAccess({
      tenantId: usageInput.tenantId,
      providerKey: usageInput.providerKey,
      purpose: "authorized_test",
      callDirection: "outbound"
    })).resolves.toEqual(expect.objectContaining({ allowed: false, errorCategory: "managed_voice_allowance_missing" }));
  });

  it("admits a configured test only after checks and returns its pricing snapshot", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [accessRow] });
    const decision = await evaluateVoiceAccess({
      tenantId: usageInput.tenantId,
      providerKey: usageInput.providerKey,
      purpose: "authorized_test",
      callDirection: "outbound"
    });
    expect(decision).toEqual(expect.objectContaining({
      allowed: true,
      maxDurationSeconds: 600,
      pricingSnapshot: expect.objectContaining({ policyId: "policy-1", unitPriceCents: 25 })
    }));
  });
});

describe("managed voice usage persistence", () => {
  it("retains provider-cost exposure as pending review when paid managed pricing is absent", async () => {
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (typeof sql !== "string") return null;
      if (sql.includes("select id, quantity, customer_charge_cents")) return { rows: [] };
      if (sql.includes("with tenant_plan as") && sql.includes("admission_pricing_snapshot")) {
        return { rows: [{
          ownership_mode: "ferocity_managed",
          plan_key: "starter",
          sponsorship_status: null,
          allowance_policy_id: null,
          included_quantity: null,
          hard_limit_quantity: null,
          overage_unit_price_cents: null,
          metadata_json: null,
          prior_minutes: 0,
          admission_pricing_snapshot: { policyId: "invalid-incomplete-snapshot", unitPriceCents: 0 }
        }] };
      }
      if (sql.includes("insert into public.usage_meter_events")) return { rows: [{
        id: "meter-1", quantity: 2, provider_cost_cents: 17, customer_charge_cents: 0,
        status: "pending_review", metadata_json: { customerChargeFinalized: false }
      }] };
      return { rows: [] };
    });

    await expect(recordVoiceUsage(usageInput)).resolves.toEqual({
      recorded: true, customerChargeCents: 0, retryable: false
    });
    const meterInsert = queryPostgresMock.mock.calls.find(([sql]) => sql.includes("insert into public.usage_meter_events"));
    expect(meterInsert?.[1]).toEqual(expect.arrayContaining([17, "pending_review"]));
    const metadata = JSON.parse(meterInsert?.[1]?.[10] as string);
    expect(metadata).toEqual(expect.objectContaining({
      pricingReconciliationStatus: "pending_pricing_policy",
      customerChargeFinalized: false,
      managedVoice: true
    }));
    expect(queryPostgresMock.mock.calls.some(([sql]) => sql.includes("insert into public.billing_usage_charges"))).toBe(false);
  });

  it("uses the validated admission snapshot when the active policy disappears before completion", async () => {
    const admissionSnapshot = {
      policyId: "policy-at-admission",
      planKey: "calls",
      includedMinutes: 0,
      unitPriceCents: 25,
      pricingDisclosed: true,
      autoBillDisclosedOverage: true,
      sponsoredByFerocity: false,
      capturedAt: "2026-10-22T00:00:00.000Z"
    };
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (typeof sql !== "string") return null;
      if (sql.includes("select id, quantity, customer_charge_cents")) return { rows: [] };
      if (sql.includes("with tenant_plan as") && sql.includes("admission_pricing_snapshot")) {
        return { rows: [{
          ownership_mode: "ferocity_managed",
          plan_key: "calls",
          sponsorship_status: null,
          allowance_policy_id: null,
          included_quantity: null,
          hard_limit_quantity: null,
          overage_unit_price_cents: null,
          metadata_json: null,
          prior_minutes: 0,
          admission_pricing_snapshot: admissionSnapshot
        }] };
      }
      if (sql.includes("insert into public.usage_meter_events")) return { rows: [{
        id: "meter-2", quantity: 2, provider_cost_cents: 17, customer_charge_cents: 50,
        status: "approved", metadata_json: { customerChargeFinalized: true }
      }] };
      return { rows: [] };
    });

    await expect(recordVoiceUsage(usageInput)).resolves.toEqual({
      recorded: true, customerChargeCents: 50, retryable: false
    });
    const meterInsert = queryPostgresMock.mock.calls.find(([sql]) => sql.includes("insert into public.usage_meter_events"));
    expect(meterInsert?.[1]?.[7]).toBe(50);
    expect(meterInsert?.[1]?.[8]).toBe("approved");
    const metadata = JSON.parse(meterInsert?.[1]?.[10] as string);
    expect(metadata).toEqual(expect.objectContaining({
      pricingReconciliationStatus: "reconciled",
      customerChargeFinalized: true,
      usagePricingSnapshot: admissionSnapshot
    }));
    expect(queryPostgresMock.mock.calls.some(([sql]) => sql.includes("insert into public.billing_usage_charges"))).toBe(true);
  });

  it("consumes monotonic duplicate-upsert evidence without downgrading finalized cost, duration, or pricing", async () => {
    const snapshot = {
      policyId: "policy-final",
      planKey: "calls",
      includedMinutes: 0,
      unitPriceCents: 25,
      pricingDisclosed: true,
      autoBillDisclosedOverage: true,
      sponsoredByFerocity: false,
      capturedAt: "2026-10-22T00:00:00.000Z"
    };
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (typeof sql !== "string") return null;
      // Model two first-insert contenders that both observed no prior row. The
      // database upsert returns the already-finalized, greater evidence.
      if (sql.includes("select id, quantity, customer_charge_cents")) return { rows: [] };
      if (sql.includes("with tenant_plan as") && sql.includes("admission_pricing_snapshot")) {
        return { rows: [{
          ownership_mode: "ferocity_managed", plan_key: "calls", sponsorship_status: null,
          allowance_policy_id: null, included_quantity: null, hard_limit_quantity: null,
          overage_unit_price_cents: null, metadata_json: null, prior_minutes: 0,
          admission_pricing_snapshot: null
        }] };
      }
      if (sql.includes("insert into public.usage_meter_events")) return { rows: [{
        id: "meter-race", quantity: 3, provider_cost_cents: 40, customer_charge_cents: 75,
        status: "approved",
        metadata_json: { customerChargeFinalized: true, usagePricingSnapshot: snapshot }
      }] };
      return { rows: [] };
    });

    const result = await recordVoiceUsage({ ...usageInput, durationSeconds: 60, providerCostCents: 5 });
    expect(result).toEqual({ recorded: true, customerChargeCents: 75, retryable: false });
    const callUpdate = queryPostgresMock.mock.calls.find(([sql]) => sql.includes("update public.receptionist_calls"));
    expect(callUpdate?.[1]).toEqual(expect.arrayContaining([40, 75, 3]));
    expect(queryPostgresMock.mock.calls.some(([sql]) =>
      sql.includes("greatest(public.usage_meter_events.quantity,excluded.quantity)")
      && sql.includes("customerChargeFinalized")
      && sql.includes("jsonb_typeof(public.usage_meter_events.metadata_json->'usagePricingSnapshot')='object'")
    )).toBe(true);
  });

  it("serializes different calls for one tenant before calculating allowance overage", async () => {
    const insertedMeters: Array<{ quantity: number; charge: number }> = [];
    const observedPriorMinutes: number[] = [];
    let lockTail = Promise.resolve();
    let lockQueries = 0;
    const transactionalQuery = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("select id, quantity, customer_charge_cents")) return { rows: [] };
      if (sql.includes("with tenant_plan as") && sql.includes("prior_minutes")) {
        const priorMinutes = 24 + insertedMeters.reduce((total, meter) => total + meter.quantity, 0);
        observedPriorMinutes.push(priorMinutes);
        return { rows: [{
          ownership_mode: "ferocity_managed",
          plan_key: "starter",
          sponsorship_status: null,
          allowance_policy_id: "policy-1",
          included_quantity: 25,
          hard_limit_quantity: null,
          overage_unit_price_cents: 25,
          metadata_json: { disclosedOverage: true, autoBillDisclosedOverage: true },
          prior_minutes: priorMinutes,
          admission_pricing_snapshot: null
        }] };
      }
      if (sql.includes("insert into public.usage_meter_events")) {
        const quantity = Number(values[5]);
        const charge = Number(values[7]);
        insertedMeters.push({ quantity, charge });
        return { rows: [{
          id: `meter-${insertedMeters.length}`,
          quantity,
          provider_cost_cents: Number(values[6]),
          customer_charge_cents: charge,
          status: String(values[8]),
          metadata_json: JSON.parse(String(values[10]))
        }] };
      }
      return { rows: [] };
    });
    withPostgresTransactionMock.mockImplementation(async (operation) => {
      let releaseLock: () => void = () => {};
      const client = {
        query: async (sql: string, values: unknown[] = []) => {
          if (sql.includes("pg_advisory_xact_lock")) {
            lockQueries += 1;
            const precedingLock = lockTail;
            lockTail = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await precedingLock;
            return { rows: [{}] };
          }
          return transactionalQuery(sql, values);
        }
      };
      try {
        return await operation(client);
      } finally {
        releaseLock();
      }
    });

    const firstInput = { ...usageInput, providerCallId: "provider-call-a", callId: "call-a" };
    const secondInput = { ...usageInput, providerCallId: "provider-call-b", callId: "call-b" };
    const results = await Promise.all([recordVoiceUsage(firstInput), recordVoiceUsage(secondInput)]);

    expect(lockQueries).toBe(2);
    expect(observedPriorMinutes).toEqual([24, 26]);
    expect(insertedMeters.map((meter) => meter.charge)).toEqual([25, 50]);
    expect(insertedMeters.reduce((total, meter) => total + meter.charge, 0)).toBe(75);
    expect(results.map((result) => result.customerChargeCents)).toEqual([25, 50]);
  });

  it("keeps recorded sponsorship and provider-cost finalization on later retries", async () => {
    const recordedSnapshot = {
      policyId: "policy-sponsored-at-recording",
      planKey: "starter",
      includedMinutes: 0,
      unitPriceCents: 25,
      pricingDisclosed: true,
      autoBillDisclosedOverage: true,
      sponsoredByFerocity: true,
      capturedAt: "2026-10-22T00:00:00.000Z"
    };
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (sql.includes("select id, quantity, customer_charge_cents")) return { rows: [{
        id: "meter-sponsored",
        quantity: 2,
        customer_charge_cents: 0,
        status: "included",
        metadata_json: {
          managedVoice: true,
          sponsoredByFerocity: true,
          providerCostFinalized: true,
          customerChargeFinalized: true,
          usagePricingSnapshot: recordedSnapshot
        }
      }] };
      if (sql.includes("other_minutes")) return { rows: [{
        ownership_mode: "ferocity_managed",
        plan_key: "starter",
        sponsorship_status: null,
        allowance_policy_id: "new-policy",
        included_quantity: 0,
        overage_unit_price_cents: 99,
        metadata_json: { disclosedOverage: true, autoBillDisclosedOverage: true },
        other_minutes: 50,
        admission_pricing_snapshot: {
          ...recordedSnapshot,
          policyId: "new-admission-policy",
          sponsoredByFerocity: false
        }
      }] };
      return { rows: [] };
    });

    await recordVoiceUsage({ ...usageInput, providerCostCents: 0 });

    const meterUpdate = queryPostgresMock.mock.calls.find(([sql]) =>
      sql.includes("update public.usage_meter_events")
    );
    expect(meterUpdate?.[1]?.[4]).toBe(0);
    const metadata = JSON.parse(String(meterUpdate?.[1]?.[6]));
    expect(metadata).toEqual(expect.objectContaining({
      sponsoredByFerocity: true,
      providerCostFinalized: true,
      usagePricingSnapshot: recordedSnapshot
    }));
  });

  it("reports a rolled-back transaction as retryable and reconciles the duplicate retry", async () => {
    withPostgresTransactionMock.mockResolvedValueOnce(null);
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (sql.includes("select id, quantity, customer_charge_cents")) return { rows: [] };
      if (sql.includes("with tenant_plan as") && sql.includes("prior_minutes")) return { rows: [{
        ownership_mode: "ferocity_managed",
        plan_key: "starter",
        sponsorship_status: null,
        allowance_policy_id: "policy-1",
        included_quantity: 25,
        hard_limit_quantity: null,
        overage_unit_price_cents: 25,
        metadata_json: { disclosedOverage: true, autoBillDisclosedOverage: true },
        prior_minutes: 24,
        admission_pricing_snapshot: null
      }] };
      if (sql.includes("insert into public.usage_meter_events")) return { rows: [{
        id: "meter-retry",
        quantity: 2,
        provider_cost_cents: 17,
        customer_charge_cents: 25,
        status: "approved",
        metadata_json: { customerChargeFinalized: true, providerCostFinalized: true }
      }] };
      return { rows: [] };
    });

    await expect(recordVoiceUsage(usageInput)).resolves.toEqual({
      recorded: false,
      customerChargeCents: 0,
      retryable: true
    });
    await expect(recordVoiceUsage(usageInput)).resolves.toEqual({
      recorded: true,
      customerChargeCents: 25,
      retryable: false
    });
    expect(queryPostgresMock.mock.calls.filter(([sql]) =>
      sql.includes("insert into public.usage_meter_events")
    )).toHaveLength(1);
  });

  it("never reads admission pricing from provider-echoed webhook metadata", () => {
    const webhook = fs.readFileSync(path.join(process.cwd(), "src/app/api/integrations/voice-ai/webhook/route.ts"), "utf8");
    const usage = fs.readFileSync(path.join(process.cwd(), "src/lib/usage/managed-voice.ts"), "utf8");
    expect(webhook).not.toContain("usagePricingSnapshot");
    expect(usage).toContain("c.admission_pricing_snapshot_json");
  });
});

