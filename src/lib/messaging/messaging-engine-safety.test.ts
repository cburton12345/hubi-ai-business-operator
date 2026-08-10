import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, providerSendMock, getServiceGateMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  providerSendMock: vi.fn(),
  getServiceGateMock: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: queryPostgresMock
}));

vi.mock("@/lib/controls/service-gates", () => ({
  getServiceGate: getServiceGateMock
}));

vi.mock("./provider-registry", () => ({
  getMessagingProvider: () => ({
    providerKey: "twilio_sms",
    displayName: "Twilio",
    getCapabilities: () => ["sms"],
    supportsCapability: () => true,
    getStatus: () => ({ ready: true, missing: [], status: "ready" }),
    sendMessage: providerSendMock,
    sendMediaMessage: providerSendMock
  }),
  getProvidersForChannel: () => []
}));

import { sendMessage } from "./messaging-engine";

const safeAccount = {
  id: "account-1",
  ownership_mode: "customer_owned",
  connection_status: "active",
  credentials_status: "configured",
  live_sending_enabled: true,
  outbound_enabled: true,
  emergency_paused: false,
  monthly_unit_cap: 1000,
  monthly_cost_cap_cents: 10000,
  hourly_send_cap: 100,
  daily_send_cap: 500,
  per_recipient_hourly_cap: 5,
  recent_failure_cap: 10,
  risk_window_minutes: 15,
  used_units: 5,
  used_cost_cents: 10,
  hourly_sends: 2,
  daily_sends: 10,
  recipient_hourly_sends: 1,
  recent_failures: 0,
  external_emergency_paused: false
};

function authorizedInput() {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    channel: "sms" as const,
    providerKey: "twilio_sms",
    to: "+15555550100",
    body: "Your appointment is tomorrow.",
    idempotencyKey: "message-1",
    authorization: {
      source: "approved_action_queue",
      humanApproved: true
    }
  };
}

function installQueryResponses(account = safeAccount, consent = { granted: true, revoked: false }) {
  queryPostgresMock.mockImplementation((sql: string) => {
    if (sql.includes("from public.messaging_opt_outs")) return Promise.resolve({ rows: [] });
    if (sql.includes("from public.contact_suppression_list")) return Promise.resolve({ rows: [] });
    if (sql.includes("select\n      (") && sql.includes("public.messaging_consents")) {
      return Promise.resolve({ rows: [consent] });
    }
    if (sql.includes("select\n      a.id") && sql.includes("hourly_sends")) {
      return Promise.resolve({ rows: [account] });
    }
    if (sql.includes("insert into public.messages") && sql.includes("returning id")) {
      return Promise.resolve({ rows: [{ id: "message-row-1" }] });
    }
    if (sql.includes("select ownership_mode") && sql.includes("tenant_messaging_accounts")) {
      return Promise.resolve({ rows: [{ ownership_mode: "customer_owned" }] });
    }
    if (sql.includes("insert into public.messaging_usage")) {
      return Promise.resolve({ rows: [{ id: "usage-1" }] });
    }
    if (sql.includes("insert into public.usage_meter_events")) {
      return Promise.resolve({ rows: [{ id: "meter-1" }] });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

describe("messaging engine provider-risk safeguards", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    providerSendMock.mockReset();
    getServiceGateMock.mockReset();
    getServiceGateMock.mockResolvedValue({ enabled: true, reason: "enabled" });
    providerSendMock.mockResolvedValue({
      ok: true,
      providerKey: "twilio_sms",
      providerMessageId: "SM123",
      status: "sent"
    });
  });

  it("requires an approved user action or live automation policy", async () => {
    installQueryResponses();
    const result = await sendMessage({ ...authorizedInput(), authorization: undefined });

    expect(result).toMatchObject({
      ok: false,
      metadata: { blockedBy: "approval_required" }
    });
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("enforces consent inside the central engine", async () => {
    installQueryResponses(safeAccount, { granted: false, revoked: false });
    const result = await sendMessage(authorizedInput());

    expect(result).toMatchObject({
      ok: false,
      metadata: { blockedBy: "consent_required" }
    });
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("honors tenant and shared emergency shutdown controls", async () => {
    installQueryResponses({ ...safeAccount, external_emergency_paused: true });
    const result = await sendMessage(authorizedInput());

    expect(result).toMatchObject({
      ok: false,
      metadata: { blockedBy: "emergency_pause" }
    });
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("does not treat stored BYO credentials as permission for live sending", async () => {
    installQueryResponses({ ...safeAccount, connection_status: "configured", live_sending_enabled: false });
    const result = await sendMessage(authorizedInput());

    expect(result).toMatchObject({
      ok: false,
      metadata: { blockedBy: "account_not_active" }
    });
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("blocks recipient over-contact without pausing other tenants", async () => {
    installQueryResponses({ ...safeAccount, recipient_hourly_sends: 5 });
    const result = await sendMessage(authorizedInput());

    expect(result).toMatchObject({
      ok: false,
      metadata: { blockedBy: "recipient_frequency_cap" }
    });
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("isolates only the failing tenant account after a provider-error burst", async () => {
    installQueryResponses({ ...safeAccount, recent_failures: 10 });
    const result = await sendMessage(authorizedInput());

    expect(result).toMatchObject({
      ok: false,
      metadata: { blockedBy: "failure_circuit_breaker" }
    });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.tenant_messaging_accounts"),
      expect.arrayContaining([
        "11111111-1111-4111-8111-111111111111",
        "account-1"
      ])
    );
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("preserves a normal approved, consented send", async () => {
    installQueryResponses();
    const result = await sendMessage(authorizedInput());

    expect(result).toMatchObject({
      ok: true,
      providerKey: "twilio_sms",
      providerMessageId: "SM123"
    });
    expect(providerSendMock).toHaveBeenCalledOnce();
  });
});
