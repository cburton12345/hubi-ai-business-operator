import { describe, expect, it } from "vitest";
import { safePostLoginDestination } from "./post-login-destination";

describe("safePostLoginDestination", () => {
  it("allows full-workspace and field-team destinations", () => {
    expect(safePostLoginDestination("/app/attention-command")).toBe("/app/attention-command");
    expect(safePostLoginDestination("/employee")).toBe("/employee");
    expect(safePostLoginDestination("/employee/visits/visit-1")).toBe("/employee/visits/visit-1");
  });

  it("rejects external and unrelated destinations", () => {
    expect(safePostLoginDestination("https://example.com")).toBe("/app");
    expect(safePostLoginDestination("//example.com")).toBe("/app");
    expect(safePostLoginDestination("/pricing")).toBe("/app");
  });
});

