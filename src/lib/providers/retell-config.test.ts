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
    VOICE_PHONE_NUMBER: undefined
  }
}));

import { resolveRetellConfiguration } from "./retell-config";

describe("resolveRetellConfiguration", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    resolveTenantProviderSecretsMock.mockReset();
    resolveTenantProviderSecretsMock.mockResolvedValue([]);
  });

  it("uses the protected platform key for a managed tenant before a number is purchased", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({
        rows: [{
          status: "paused",
          credentials_status: "configured",
          live_actions_enabled: false,
          ownership_mode: "ferocity_managed"
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(resolveRetellConfiguration("tenant-1")).resolves.toEqual({
      apiKey: "managed-retell-key",
      webhookApiKey: "managed-retell-key",
      phoneNumber: null,
      voiceId: "retell-Cimo"
    });
  });

  it("resolves each managed tenant's assigned Retell number from Ferocity", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({
        rows: [{
          status: "paused",
          credentials_status: "configured",
          live_actions_enabled: false,
          ownership_mode: "ferocity_managed"
        }]
      })
      .mockResolvedValueOnce({ rows: [{ phone_number: "+15555550123" }] });

    await expect(resolveRetellConfiguration("tenant-1")).resolves.toMatchObject({
      phoneNumber: "+15555550123"
    });
  });

  it("does not expose the platform key to a bring-your-own-provider tenant", async () => {
    queryPostgresMock.mockResolvedValueOnce({
      rows: [{
        status: "paused",
        credentials_status: "configured",
        live_actions_enabled: false,
        ownership_mode: "workspace"
      }]
    });

    await expect(resolveRetellConfiguration("tenant-2")).resolves.toBeNull();
  });
});
