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
    secrets: Array<{ label: string; value: string }>,
    aliases: string[]
  ) => secrets.find((secret) => aliases.includes(secret.label))?.value ?? null
}));

vi.mock("@/lib/env", () => ({
  env: {
    RETELL_API_KEY: "managed-retell-key",
    RETELL_WEBHOOK_SECRET: undefined,
    VOICE_PHONE_NUMBER: "+18885550000"
  }
}));

import { resolveRetellConfiguration, resolveRetellWebhookTenant, selectRetellPhoneNumber } from "./retell-config";

describe("resolveRetellConfiguration", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    resolveTenantProviderSecretsMock.mockReset();
    resolveTenantProviderSecretsMock.mockResolvedValue([]);
  });

  it("does not lend the shared platform number to a managed customer before a number is assigned", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({
        rows: [{
          status: "paused",
          credentials_status: "configured",
          live_actions_enabled: false,
          ownership_mode: "ferocity_managed",
          account_type: "customer"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(resolveRetellConfiguration("tenant-1")).resolves.toEqual({
      apiKey: "managed-retell-key",
      webhookApiKey: "managed-retell-key",
      phoneNumber: null,
      voiceId: "retell-Cimo",
      callbackStatus: "untested",
      inboundEnabled: false,
      outboundEnabled: false
    });
  });

  it("allows only the internal Ferocity tenant to fall back to the shared support number", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({
        rows: [{
          status: "paused",
          credentials_status: "configured",
          live_actions_enabled: false,
          ownership_mode: "ferocity_managed",
          account_type: "internal"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(resolveRetellConfiguration("ferocity-platform")).resolves.toMatchObject({
      phoneNumber: "+18885550000"
    });
  });

  it("resolves each managed tenant's assigned Retell number from Ferocity", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({
        rows: [{
          status: "paused",
          credentials_status: "configured",
          live_actions_enabled: false,
          ownership_mode: "ferocity_managed",
          account_type: "customer"
        }]
      })
      .mockResolvedValueOnce({ rows: [{
        phone_number: "+15555550123",
        callback_status: "certified",
        inbound_enabled: true,
        outbound_enabled: true
      }] });

    await expect(resolveRetellConfiguration("tenant-1")).resolves.toMatchObject({
      phoneNumber: "+15555550123",
      callbackStatus: "certified",
      inboundEnabled: true,
      outboundEnabled: true
    });
  });

  it("does not expose the platform key to a bring-your-own-provider tenant", async () => {
    queryPostgresMock.mockResolvedValueOnce({
      rows: [{
        status: "paused",
        credentials_status: "configured",
        live_actions_enabled: false,
        ownership_mode: "workspace",
        account_type: "customer"
      }]
    });

    await expect(resolveRetellConfiguration("tenant-2")).resolves.toBeNull();
  });

  it("rejects an explicit shared 888 credential in a customer workspace", () => {
    expect(selectRetellPhoneNumber({
      accountType: "customer",
      ownershipMode: "workspace",
      secretPhoneNumber: "+1 (888) 555-0000",
      assignedPhoneNumber: null,
      platformPhoneNumber: "+18885550000"
    })).toBeNull();
  });

  it("maps public, customer-outbound, and private-owner agents to the same trusted workspace", async () => {
    queryPostgresMock.mockResolvedValue({ rows: [{ tenant_id: "tenant-1" }] });

    await expect(resolveRetellWebhookTenant("customer-outbound-agent", "+15550001111"))
      .resolves.toBe("tenant-1");
    expect(queryPostgresMock.mock.calls[0]?.[0]).toContain("outboundAssistantId");
    expect(queryPostgresMock.mock.calls[0]?.[0]).toContain("ownerVoiceAssistantId");
  });
});
