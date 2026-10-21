import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Today page performance boundary", () => {
  it("does not load the full nine-dashboard command-center aggregate", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/page.tsx"), "utf8");
    expect(source).toContain("getTodayOverview(workspaceId)");
    expect(source).not.toContain("getAttentionCommandDashboard");
  });

  it("keeps the actual Today surface on the lightweight overview", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/attention-command/page.tsx"), "utf8");
    expect(source).toContain("getTodayOverview(workspaceId)");
    expect(source).not.toContain("getAttentionCommandDashboard()");
  });

  it("uses bounded tenant-scoped operating queries", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/dashboard/get-today-overview.ts"), "utf8");
    expect(source).toContain("where tenant_id=$1");
    expect(source).toContain("select provider,display_name,status,credentials_status");
    expect(source).not.toContain("select provider_key,status,credentials_status");
    expect(source).toContain("moneyMoves.slice(0, 2)");
    expect(source).toContain("attentionItems.slice(0, 3)");
  });
});
