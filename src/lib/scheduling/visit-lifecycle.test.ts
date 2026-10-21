import { describe, expect, it } from "vitest";
import { canTransitionVisitStatus, nextVisitStatuses } from "./visit-lifecycle";

describe("visit lifecycle", () => {
  it("allows the normal dispatch and completion path", () => {
    expect(canTransitionVisitStatus("scheduled", "dispatched")).toBe(true);
    expect(canTransitionVisitStatus("dispatched", "en_route")).toBe(true);
    expect(canTransitionVisitStatus("en_route", "arrived")).toBe(true);
    expect(canTransitionVisitStatus("arrived", "in_progress")).toBe(true);
    expect(canTransitionVisitStatus("in_progress", "completed")).toBe(true);
  });

  it("does not reopen terminal work or skip authoritative stages", () => {
    expect(canTransitionVisitStatus("completed", "scheduled")).toBe(false);
    expect(canTransitionVisitStatus("canceled", "in_progress")).toBe(false);
    expect(canTransitionVisitStatus("unscheduled", "completed")).toBe(false);
  });

  it("permits a no-show to be rescheduled without reopening canceled work", () => {
    expect(nextVisitStatuses("no_show")).toEqual(["no_show", "scheduled", "canceled"]);
  });
});
