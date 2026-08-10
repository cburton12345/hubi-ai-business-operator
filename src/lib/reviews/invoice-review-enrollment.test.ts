import { describe, expect, it } from "vitest";
import { invoiceReviewSchedule } from "./invoice-review-enrollment";

describe("invoice review enrollment", () => {
  it("waits when an invoice is sent before work is complete", () => {
    expect(invoiceReviewSchedule("invoice_sent", false)).toMatchObject({ eligible: false });
  });

  it("schedules after completed work without asking at the payment moment", () => {
    expect(invoiceReviewSchedule("invoice_sent", true)).toEqual({ eligible: true, triggerEvent: "job_completed", delayHours: 24 });
    expect(invoiceReviewSchedule("invoice_paid", false)).toEqual({ eligible: true, triggerEvent: "invoice_paid", delayHours: 2 });
  });
});
