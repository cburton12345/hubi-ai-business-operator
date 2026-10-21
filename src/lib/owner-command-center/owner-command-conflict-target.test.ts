import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "src/app/app/ai-workforce/actions.ts",
  "src/app/app/personal-ops/actions.ts",
  "src/lib/ai-monitoring/get-ai-monitoring-center.ts",
  "src/lib/automation/run-business-automation.ts",
  "src/lib/owner-command-center/sync-owner-command-events.ts",
];

describe("owner command event conflict targets", () => {
  it.each(files)("matches the partial unique index in %s", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/on conflict \(tenant_id,\s*platform_key,\s*external_event_id\)\s+do/);
    for (const conflict of source.matchAll(/on conflict \(tenant_id,\s*platform_key,\s*external_event_id\)/g)) {
      expect(source.slice(conflict.index, conflict.index + 140)).toContain("where external_event_id is not null");
    }
  });
});
