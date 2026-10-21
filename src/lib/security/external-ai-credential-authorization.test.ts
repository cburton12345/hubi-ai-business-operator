import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { can, type AccessActor } from "@/lib/auth/permissions";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("external AI credential authorization", () => {
  it("allows workspace owners and admins but denies operators and viewers", () => {
    const actor = (tenantRole: AccessActor["tenantRole"]): AccessActor => ({
      userId: "user-1", email: "owner@example.com", platformRole: "user", tenantRole,
    });
    expect(can(actor("owner"), "tenant:manage")).toBe(true);
    expect(can(actor("admin"), "tenant:manage")).toBe(true);
    expect(can(actor("operator"), "tenant:manage")).toBe(false);
    expect(can(actor("viewer"), "tenant:manage")).toBe(false);
  });

  it("reauthorizes every credential mutation on the server", () => {
    const actions = read("src/app/app/integrations/external-ai/actions.ts");
    expect(actions.match(/requirePermission\("tenant:manage"\)/g)).toHaveLength(4);
    expect(actions).toContain("actor.workspace.id");
    expect(actions).not.toContain("localStorage");
    expect(actions).not.toContain("sessionStorage");
  });

  it("keeps plaintext tokens one-time and stores only the hash", () => {
    const service = read("src/lib/mcp/credentials.ts");
    const migration = read("supabase/migrations/252_external_ai_mcp_credentials.sql");
    expect(service).toContain('createHash("sha256")');
    expect(service).toContain("plaintextStored: false");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).not.toMatch(/plaintext_token|raw_token/);
  });

  it("requires and preserves a durable external-provider consent receipt", () => {
    const actions = read("src/app/app/integrations/external-ai/actions.ts");
    const form = read("src/app/app/integrations/external-ai/ExternalAiCredentialForms.tsx");
    const migration = read("supabase/migrations/252_external_ai_mcp_credentials.sql");
    expect(actions).toContain('consentAcknowledged: z.literal("yes")');
    expect(form).toContain('name="consentAcknowledged"');
    expect(form).toContain("required");
    expect(migration).toContain("consent_version text not null");
    expect(migration).toContain("consented_at timestamptz not null");
    expect(migration).toContain("consent_summary text not null");
  });

  it("keeps outside AI optional and Ferocity-native AI available", () => {
    const page = read("src/app/app/integrations/external-ai/page.tsx");
    const onboarding = read("src/lib/onboarding/customer-onboarding.ts");
    expect(page).toContain("You do not need to connect another assistant");
    expect(onboarding).not.toContain('capability: "external_ai"');
  });
});
