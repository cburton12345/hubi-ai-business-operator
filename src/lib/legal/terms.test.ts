import { describe, expect, it } from "vitest";
import { TERMS_LAST_UPDATED, TERMS_VERSION } from "./terms";

describe("legal terms version", () => {
  it("keeps a machine-readable acceptance version and public date", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_LAST_UPDATED).toContain("2026");
  });
});
