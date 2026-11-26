import { describe, expect, it } from "vitest";
import { boundedUserAgent, secondsUntil, trustedDeviceLabel, trustedSessionAbsoluteDays, trustedSessionDays, trustedSessionRenewalWindowDays } from "./session-policy";

describe("trusted device session policy", () => {
  it("uses a long but bounded rolling session", () => {
    expect(trustedSessionDays).toBe(90);
    expect(trustedSessionRenewalWindowDays).toBe(30);
    expect(trustedSessionAbsoluteDays).toBe(365);
  });

  it("classifies common field devices without retaining an unbounded agent", () => {
    expect(trustedDeviceLabel("Mozilla/5.0 (Linux; Android 15) AppleWebKit Chrome/130 Mobile")).toBe("Chrome on Android");
    expect(trustedDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18 Safari/604.1")).toBe("Safari on iPhone");
    expect(boundedUserAgent(`Chrome ${"x".repeat(1000)}`)).toHaveLength(512);
  });

  it("never returns a negative cookie lifetime", () => {
    const now = new Date("2026-11-25T00:00:00Z");
    expect(secondsUntil(new Date("2026-11-26T00:00:00Z"), now)).toBe(86400);
    expect(secondsUntil(new Date("2026-11-24T00:00:00Z"), now)).toBe(0);
  });
});
