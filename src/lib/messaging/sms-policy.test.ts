import { describe, expect, it } from "vitest";
import { classifySmsKeyword, estimateSmsSegments, inferSmsPurpose, isWithinQuietHours, localTimeInZone } from "./sms-policy";

describe("SMS policy", () => {
  it("recognizes reasonable STOP and HELP variants", () => {
    expect(classifySmsKeyword(" opt-out! ")).toBe("stop");
    expect(classifySmsKeyword("revoke")).toBe("stop");
    expect(classifySmsKeyword("support.")).toBe("help");
    expect(classifySmsKeyword("please stop by tomorrow")).toBeNull();
  });

  it("counts GSM extension and Unicode segments", () => {
    expect(estimateSmsSegments("a".repeat(160))).toMatchObject({ encoding: "gsm7", units: 1 });
    expect(estimateSmsSegments("a".repeat(161))).toMatchObject({ encoding: "gsm7", units: 2 });
    expect(estimateSmsSegments("^".repeat(81))).toMatchObject({ encoding: "gsm7", units: 2 });
    expect(estimateSmsSegments("é".repeat(71))).toMatchObject({ encoding: "gsm7", units: 1 });
    expect(estimateSmsSegments("🙂".repeat(36))).toMatchObject({ encoding: "ucs2", units: 2 });
  });

  it("handles quiet hours that cross midnight", () => {
    expect(isWithinQuietHours("22:00", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("07:59", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("12:00", "21:00", "08:00")).toBe(false);
    expect(localTimeInZone(new Date("2026-08-28T12:00:00Z"), "UTC")).toBe("12:00");
  });

  it("separates marketing from operational messages", () => {
    expect(inferSmsPurpose("lead_reactivation_campaign")).toBe("marketing");
    expect(inferSmsPurpose("invoice_followup")).toBe("transactional");
    expect(inferSmsPurpose("job_update")).toBe("service");
  });
});
