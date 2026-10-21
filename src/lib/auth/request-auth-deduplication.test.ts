import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("authenticated request data access", () => {
  it("deduplicates session, admin, and workspace resolution during one React render", () => {
    const session = read("src/lib/auth/session.ts");
    const admin = read("src/lib/auth/admin-session.ts");
    const workspace = read("src/lib/workspace/current-workspace.ts");

    for (const source of [session, admin, workspace]) {
      expect(source).toContain('import { cache } from "react"');
    }
    expect(session).toContain("export const getCurrentAppSession = cache(async");
    expect(admin).toContain("export const hasAdminSession = cache(async");
    expect(workspace).toContain("export const getCurrentWorkspace = cache(async");
  });
});
