import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hashOwnerVerificationCode,
  isWithinQuietHours,
  ownerVerificationCodesMatch
} from "./owner-briefings";

describe("owner briefing interruption rules", () => {
  it("handles quiet hours that cross midnight", () => {
    expect(isWithinQuietHours({
      timeZone: "UTC",
      start: "21:00:00",
      end: "07:00:00",
      now: new Date("2026-08-03T01:00:00.000Z")
    })).toBe(true);
    expect(isWithinQuietHours({
      timeZone: "UTC",
      start: "21:00:00",
      end: "07:00:00",
      now: new Date("2026-08-03T14:00:00.000Z")
    })).toBe(false);
  });

  it("treats missing quiet-hour boundaries as disabled", () => {
    expect(isWithinQuietHours({ timeZone: "UTC", start: null, end: null })).toBe(false);
  });
});

describe("owner destination verification codes", () => {
  const previousKey = process.env.SECURITY_HMAC_KEY;

  beforeEach(() => {
    process.env.SECURITY_HMAC_KEY = "test-owner-verification-key-with-more-than-32-characters";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.SECURITY_HMAC_KEY;
    else process.env.SECURITY_HMAC_KEY = previousKey;
  });

  it("binds a code to its challenge and compares hashes safely", () => {
    const hash = hashOwnerVerificationCode("challenge-one", "123456");
    expect(ownerVerificationCodesMatch(hash, hashOwnerVerificationCode("challenge-one", "123456"))).toBe(true);
    expect(ownerVerificationCodesMatch(hash, hashOwnerVerificationCode("challenge-two", "123456"))).toBe(false);
    expect(ownerVerificationCodesMatch(hash, hashOwnerVerificationCode("challenge-one", "654321"))).toBe(false);
  });
});
