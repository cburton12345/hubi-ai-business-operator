import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("QA route crawler redirect handling", () => {
  it("follows only same-origin protected app meta redirects", async () => {
    const source = await readFile(new URL("../../../scripts/qa-route-crawl.mjs", import.meta.url), "utf8");
    expect(source).toContain("function getSafeAppMetaRedirect(body)");
    expect(source).toContain('target.origin !== expectedOrigin || !target.pathname.startsWith("/app/")');
    expect(source).toContain("if (safeMetaRedirect)");
    expect(source).toContain('body.includes("NEXT_REDIRECT") && !getSafeAppMetaRedirect(body)');
  });

  it("keeps runtime failures distinct from intentional framework redirects", async () => {
    const source = await readFile(new URL("../../../scripts/qa-route-crawl.mjs", import.meta.url), "utf8");
    expect(source).toContain('body.includes("Application error:")');
    expect(source).toContain('body.includes("Unhandled Runtime Error")');
    const runtimeErrorFunction = source.match(/function looksLikeRuntimeError\(body\) \{[\s\S]*?\n\}/)?.[0];
    expect(runtimeErrorFunction).toBeTruthy();
    expect(runtimeErrorFunction).not.toContain("NEXT_REDIRECT");
  });
});
