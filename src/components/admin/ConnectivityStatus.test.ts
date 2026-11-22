import { describe, expect, it } from "vitest";
import { classifyConnectivity } from "./ConnectivityStatus";

describe("classifyConnectivity", () => {
  it("trusts an explicit browser-offline signal", () => {
    expect(classifyConnectivity(false, true)).toBe("offline");
    expect(classifyConnectivity(false, false)).toBe("offline");
  });

  it("requires Ferocity health evidence before reporting online", () => {
    expect(classifyConnectivity(true, true)).toBe("online");
    expect(classifyConnectivity(true, false)).toBe("degraded");
  });
});
