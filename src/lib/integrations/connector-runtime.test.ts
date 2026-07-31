import { describe, expect, it } from "vitest";
import { connectorCanBeMarkedReady, connectorExecutionMode } from "./connector-runtime";

describe("connector runtime truthfulness", () => {
  it("recognizes executable adapters", () => {
    expect(connectorExecutionMode("facebook")).toBe("executable_adapter");
    expect(connectorExecutionMode("twilio")).toBe("executable_adapter");
    expect(connectorExecutionMode("voice_ai")).toBe("executable_adapter");
    expect(connectorCanBeMarkedReady("facebook")).toBe(true);
  });

  it("recognizes a useful native path without claiming provider sync", () => {
    expect(connectorExecutionMode("quickbooks")).toBe("native_fallback");
    expect(connectorCanBeMarkedReady("quickbooks")).toBe(true);
  });

  it("does not let connection scaffolding masquerade as an executable adapter", () => {
    expect(connectorExecutionMode("reddit")).toBe("setup_only");
    expect(connectorCanBeMarkedReady("reddit")).toBe(false);
  });
});
