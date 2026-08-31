import { describe, expect, it } from "vitest";
import { calculateInboundReserve } from "./outbound-capacity";

describe("calculateInboundReserve", () => {
  it("reserves five inbound slots at the current twenty-call limit", () => {
    expect(calculateInboundReserve(20)).toBe(5);
  });

  it("adapts when the provider raises capacity", () => {
    expect(calculateInboundReserve(50)).toBe(13);
    expect(calculateInboundReserve(60)).toBe(15);
  });

  it("does not make very small accounts unusable", () => {
    expect(calculateInboundReserve(1)).toBe(0);
    expect(calculateInboundReserve(2)).toBe(0);
    expect(calculateInboundReserve(3)).toBe(2);
  });
});
