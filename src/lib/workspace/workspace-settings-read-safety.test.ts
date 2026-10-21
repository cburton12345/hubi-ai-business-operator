import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("workspace settings reads", () => {
  it("does not write default settings during an ordinary page render", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/workspace/get-workspace-settings.ts"), "utf8");
    const getter = source.slice(source.indexOf("export async function getWorkspaceSettings"));
    expect(getter).toContain("await getCurrentWorkspace()");
    expect(getter).not.toContain("await ensureWorkspaceSettings()");
  });
});
