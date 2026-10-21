import { describe, expect, it } from "vitest";
import {
  classifyIntegrationGoal,
  integrationGoalIdentity,
  isActionableIntegrationObservation,
  type IntegrationGoalObservation,
} from "./goal-observation";

function event(overrides: Partial<IntegrationGoalObservation> = {}): IntegrationGoalObservation {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    platformKey: "stripe",
    platformName: "Stripe",
    externalEventId: "evt_1",
    eventType: "invoice.payment_failed",
    title: "Invoice payment failed",
    summary: "The provider rejected the payment attempt.",
    severity: "high",
    status: "open",
    metadata: { invoiceId: "invoice-1", accountId: "account-1" },
    ...overrides,
  };
}

describe("provider-neutral integration goal observations", () => {
  it("binds repeated provider events to the same entity goal", () => {
    expect(integrationGoalIdentity(event({ externalEventId: "evt_1" }))).toEqual(
      integrationGoalIdentity(event({ externalEventId: "evt_2" })),
    );
    expect(integrationGoalIdentity(event()).goalKey).toBe(
      "stripe:account-1:invoice:invoice-1",
    );
  });

  it("classifies financial, service, communication, and integration outcomes", () => {
    expect(classifyIntegrationGoal(event()).goalType).toBe("financial_outcome");
    expect(classifyIntegrationGoal(event({ eventType: "job.dispatch_failed", title: "Job dispatch failed", summary: "The crew was not dispatched.", metadata: { jobId: "job-1" } })).goalType).toBe("service_outcome");
    expect(classifyIntegrationGoal(event({ eventType: "message.delivery_failed", title: "SMS delivery failed", summary: "The customer message was not delivered.", metadata: { messageId: "message-1" } })).goalType).toBe("communication_outcome");
    expect(classifyIntegrationGoal(event({ eventType: "oauth.expired", title: "OAuth connection expired", summary: "The provider token needs renewal.", metadata: { connectionId: "connection-1" } })).goalType).toBe("integration_recovery");
  });

  it("does not turn routine informational sync traffic into goals", () => {
    expect(isActionableIntegrationObservation(event({
      eventType: "calendar.sync_completed",
      title: "Calendar sync completed",
      summary: "No changes were required.",
      severity: "info",
      status: "watching",
    }))).toBe(false);
  });

  it("treats a resolved event as evidence for an existing goal, not a new goal", () => {
    expect(isActionableIntegrationObservation(event({
      eventType: "invoice.paid",
      title: "Invoice paid",
      summary: "Payment settled.",
      status: "resolved",
    }))).toBe(false);
  });
});
