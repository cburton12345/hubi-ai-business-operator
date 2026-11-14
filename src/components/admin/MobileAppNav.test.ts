import { describe, expect, it } from "vitest";
import { isMobilePathActive } from "./MobileAppNav";

describe("isMobilePathActive", () => {
  it("matches exact destinations and their nested routes", () => {
    expect(
      isMobilePathActive("/app/job-tracker/health", ["/app/job-tracker"]),
    ).toBe(true);
    expect(isMobilePathActive("/app/lead-command", ["/app/lead-command"])).toBe(
      true,
    );
  });

  it("does not let the app root swallow every app route", () => {
    expect(isMobilePathActive("/app", ["/app"])).toBe(true);
    expect(isMobilePathActive("/app/reports", ["/app"])).toBe(false);
  });

  it("does not match a route with a shared text prefix", () => {
    expect(isMobilePathActive("/app/jobs-old", ["/app/jobs"])).toBe(false);
  });
});
