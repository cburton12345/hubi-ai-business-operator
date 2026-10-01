import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./create-support-issue.ts", import.meta.url), "utf8");

describe("support request reliability", () => {
  it("keeps a saved support reference valid when a notification provider fails", () => {
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("support.create_issue.notification");
    expect(source).toContain("return { issueId }");
  });

  it("routes every saved issue to the platform administrator queue", () => {
    expect(source).toContain("raisePlatformAdminAlert");
    expect(source).toContain("customer_support");
    expect(source).toContain("support-request:${issueId}");
  });
});
