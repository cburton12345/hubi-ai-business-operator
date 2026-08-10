import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, resolveTenantProviderSecretsMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  resolveTenantProviderSecretsMock: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: queryPostgresMock
}));

vi.mock("@/lib/credentials/resolve-tenant-provider-secrets", () => ({
  resolveTenantProviderSecrets: resolveTenantProviderSecretsMock,
  secretByAliases: (
    secrets: Array<{ label: string; kind: string; value: string }>,
    aliases: string[],
    kind?: string
  ) => secrets.find((secret) => aliases.includes(secret.label) || (kind ? secret.kind === kind : false))?.value ?? null
}));

vi.mock("@/lib/env", () => ({
  env: {
    ENABLE_TWILIO_SMS_SENDS: "true",
    TWILIO_ACCOUNT_SID: "AC_PARENT",
    TWILIO_AUTH_TOKEN: "parent-token",
    TWILIO_FROM_NUMBER: "+15555559999"
  }
}));

import { resolveTwilioSmsConfiguration } from "./twilio-tenant-config";

const managedAccount = {
  ownership_mode: "ferocity_managed",
  connection_status: "active",
  credentials_status: "configured",
  live_sending_enabled: true,
  outbound_enabled: true,
  provider_account_ref: "AC_SUBACCOUNT",
  metadata_json: {}
};

describe("managed Twilio tenant isolation", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    resolveTenantProviderSecretsMock.mockReset();
  });

  it("uses an active customer's own Twilio credentials before any managed route", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({
        rows: [{
        ownership_mode: "customer_owned",
        connection_status: "active",
        credentials_status: "configured",
        live_sending_enabled: true,
        outbound_enabled: true,
        provider_account_ref: "AC_CUSTOMER",
        metadata_json: {}
        }]
      })
      .mockResolvedValueOnce({ rows: [] });
    resolveTenantProviderSecretsMock.mockImplementation((_tenantId: string, providerKey: string) =>
      Promise.resolve(providerKey === "twilio_sms"
        ? [
            { label: "account_sid", kind: "account_sid", value: "AC_CUSTOMER" },
            { label: "api_key_sid", kind: "api_key_sid", value: "SK_CUSTOMER" },
            { label: "api_key_secret", kind: "api_key_secret", value: "customer-secret" },
            { label: "auth_token", kind: "auth_token", value: "customer-webhook-token" },
            { label: "messaging_service_sid", kind: "messaging_service_sid", value: "MG_CUSTOMER" }
          ]
        : [])
    );

    await expect(resolveTwilioSmsConfiguration("tenant-customer")).resolves.toEqual({
      ownershipMode: "customer_owned",
      accountSid: "AC_CUSTOMER",
      authUsername: "SK_CUSTOMER",
      authPassword: "customer-secret",
      webhookAuthToken: "customer-webhook-token",
      fromNumber: null,
      messagingServiceSid: "MG_CUSTOMER"
    });
    expect(queryPostgresMock.mock.calls.some(([sql]) => String(sql).includes("twilio_isv_customer_routes"))).toBe(false);
  });

  it("uses the tenant's active subaccount route, sender, and webhook token", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [managedAccount] })
      .mockResolvedValueOnce({
        rows: [{
          customer_subaccount_sid: "AC_SUBACCOUNT",
          messaging_service_sid: "MG_TENANT",
          phone_number: "+15555550123"
        }]
      });
    resolveTenantProviderSecretsMock.mockImplementation((_tenantId: string, providerKey: string) =>
      Promise.resolve(providerKey === "twilio_managed"
        ? [{ label: "subaccount_auth_token", kind: "auth_token", value: "tenant-webhook-token" }]
        : [])
    );

    await expect(resolveTwilioSmsConfiguration("tenant-1")).resolves.toEqual({
      ownershipMode: "ferocity_managed",
      accountSid: "AC_SUBACCOUNT",
      authUsername: "AC_PARENT",
      authPassword: "parent-token",
      webhookAuthToken: "tenant-webhook-token",
      fromNumber: "+15555550123",
      messagingServiceSid: "MG_TENANT"
    });
  });

  it("does not fall back to a shared platform number when the tenant route is missing", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [managedAccount] })
      .mockResolvedValueOnce({ rows: [] });
    resolveTenantProviderSecretsMock.mockResolvedValue([]);

    await expect(resolveTwilioSmsConfiguration("tenant-2")).resolves.toBeNull();
  });
});
