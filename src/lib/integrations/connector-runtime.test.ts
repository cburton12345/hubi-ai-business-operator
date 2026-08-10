import { describe, expect, it } from "vitest";
import { connectorCanBeMarkedReady, connectorExecutionMode } from "./connector-runtime";

describe("connector runtime truthfulness", () => {
  it("recognizes executable adapters", () => {
    expect(connectorExecutionMode("twilio")).toBe("executable_adapter");
    expect(connectorExecutionMode("voice_ai")).toBe("executable_adapter");
    expect(connectorCanBeMarkedReady("jobber")).toBe(true);
    expect(connectorCanBeMarkedReady("search_console")).toBe(true);
    expect(connectorCanBeMarkedReady("analytics")).toBe(true);
  });

  it("recognizes a useful native path without claiming provider sync", () => {
    expect(connectorExecutionMode("quickbooks")).toBe("native_fallback");
    expect(connectorCanBeMarkedReady("quickbooks")).toBe(true);
  });

  it("does not let connection scaffolding masquerade as an executable adapter", () => {
    for (const provider of ["facebook", "google_ads", "reddit", "microsoft_ads", "yahoo_ads"]) {
      expect(connectorExecutionMode(provider)).toBe("setup_only");
      expect(connectorCanBeMarkedReady(provider)).toBe(false);
    }
  });
});
