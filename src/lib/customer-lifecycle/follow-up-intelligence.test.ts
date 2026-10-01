import { describe, expect, it } from "vitest";
import { planLeadFollowUp, type FollowUpCandidate } from "./follow-up-intelligence";

const base: FollowUpCandidate = {
  leadId: "11111111-1111-4111-8111-111111111111",
  status: "contacted",
  priority: "normal",
  leadScore: 72,
  source: "website",
  originalRequest: "Needs a spring roof inspection",
  serviceInterest: "roof inspection",
  urgency: "this month",
  lostReason: null,
  daysInactive: 9,
  previousTouches: 1,
  hasPhone: true,
  hasEmail: true,
  consentToContact: true,
  responseStopActive: false,
  openConversation: false
};

describe("context-aware follow-up planning", () => {
  it("uses business context and keeps the touch reviewable", () => {
    expect(planLeadFollowUp(base)).toMatchObject({
      eligible: true,
      segment: "active_interest",
      channel: "sms",
      sequenceStep: 2,
      requiresApproval: true
    });
    expect(planLeadFollowUp(base).suggestedMessage).toContain("roof inspection");
  });

  it("never adds nurture on top of an active customer conversation", () => {
    expect(planLeadFollowUp({ ...base, openConversation: true })).toMatchObject({
      eligible: false,
      strategyKey: "do_not_nurture_active_conversation",
      channel: "manual"
    });
  });

  it("caps repeated outreach and requires manual review", () => {
    expect(planLeadFollowUp({ ...base, previousTouches: 4 })).toMatchObject({
      eligible: false,
      segment: "manual_review",
      strategyKey: "frequency_cap_review"
    });
  });

  it("does not treat a reachable address as permission", () => {
    const plan = planLeadFollowUp({ ...base, consentToContact: false });
    expect(plan.channel).toBe("manual");
    expect(plan.suggestedMessage).toContain("Do not send");
  });

  it("reactivates old leads with a low-pressure relevance check", () => {
    const plan = planLeadFollowUp({ ...base, status: "lost", daysInactive: 180, previousTouches: 0 });
    expect(plan.segment).toBe("long_term_reactivation");
    expect(plan.suggestedMessage.toLowerCase()).not.toContain("limited time");
  });
});
