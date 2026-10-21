import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const callbacks = [
  "src/lib/integrations/complete-standard-oauth.ts",
  "src/app/api/integrations/meta/oauth/callback/route.ts",
  "src/app/api/integrations/[provider]/oauth/callback/route.ts",
  "src/app/api/integrations/tiktok-business/oauth/callback/route.ts",
  "src/app/api/integrations/x_ads/oauth/callback/route.ts",
];

describe("OAuth callback continuity contract", () => {
  it("claims one recent queued job inside the signed-in workspace", () => {
    for (const path of callbacks) {
      const runtime = source(path);
      expect(runtime).toContain("tenant_id");
      expect(runtime).toContain("status");
      expect(runtime).toMatch(/for update skip locked/i);
    }
  });

  it("restores returnTo only after the tenant-bound job has been claimed", () => {
    for (const path of callbacks) {
      const runtime = source(path);
      expect(runtime).toContain("payload_json->>'returnTo' as return_to");
      expect(runtime).toContain("job.return_to");
    }
  });

  it("preserves onboarding destinations in every custom OAuth start", () => {
    const starts = [
      "src/app/api/integrations/[provider]/oauth/start/route.ts",
      "src/app/api/integrations/tiktok-business/oauth/start/route.ts",
      "src/app/api/integrations/x_ads/oauth/start/route.ts",
    ];
    for (const path of starts) {
      const runtime = source(path);
      expect(runtime).toContain("normalizeOAuthReturnTo");
      expect(runtime).toContain("returnTo");
    }
  });
});
