import { describe, expect, it } from "vitest";
import { connectorCanBeMarkedReady, connectorCanConnectAccount, connectorExecutionMode } from "./connector-runtime";

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

  it("allows real account authorization without claiming an executable adapter", () => {
    for (const provider of ["facebook", "google_ads", "reddit", "microsoft_ads"]) {
      expect(connectorExecutionMode(provider)).toBe("connection_only");
      expect(connectorCanBeMarkedReady(provider)).toBe(false);
      expect(connectorCanConnectAccount(provider)).toBe(true);
    }
  });

  it("keeps unimplemented provider setup unavailable", () => {
    expect(connectorExecutionMode("yahoo_ads")).toBe("setup_only");
    expect(connectorCanConnectAccount("yahoo_ads")).toBe(false);
  });
});
