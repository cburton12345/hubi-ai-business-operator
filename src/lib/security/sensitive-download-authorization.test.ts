import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("sensitive download authorization", () => {
  it("requires financial mutation access before signing an original document URL", () => {
    const route = source("src/app/api/expense-documents/[documentId]/original/route.ts");
    expect(route).toContain('authorizeApiPermission("lead:manage")');
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain("getCurrentWorkspaceId");
  });

  it("requires workspace management before returning a full export", () => {
    const route = source("src/app/api/workspace-data-exports/[exportId]/download/route.ts");
    expect(route).toContain('authorizeApiPermission("tenant:manage")');
    expect(route).toContain("authorization.actor.workspace.id");
  });

  it("does not allow draft export mutation through workspace fallback", () => {
    const actions = source("src/app/app/exports/actions.ts");
    const start = actions.indexOf("export async function createExportFromDraftAction");
    const end = actions.indexOf("\nasync function getRows", start);
    const body = actions.slice(start, end);
    expect(body).toContain('requirePermission("ai:queue")');
    expect(body).toContain("actor.workspace.id");
  });
});
