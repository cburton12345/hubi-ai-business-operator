import { describe, expect, it } from "vitest";
import {
  assessConversationalAction,
  conversationalActionNeedsStrongAuthentication,
  conversationalActionSchema
} from "./conversational-actions";
import { adjustedCents, validScheduleWindow } from "./conversational-action-executors";

describe("owner conversational action safety", () => {
  it("keeps internal notes low risk and does not confuse discussion with external authorization", () => {
    const action = conversationalActionSchema.parse({
      type: "record_decision",
      title: "Johnson estimate",
      decision: "Do not offer a discount.",
      permanence: "one_time"
    });
    expect(assessConversationalAction(action)).toMatchObject({
      riskLevel: "low",
      requiresExplicitApproval: false,
      requiresSecondaryConfirmation: false
    });
  });

  it("requires explicit approval before contacting anyone", () => {
    const action = conversationalActionSchema.parse({
      type: "send_message",
      channel: "sms",
      recipientType: "customer",
      recipientId: "d3b7755f-3d0d-4c93-9f1c-a1a0a2f78be9",
      message: "Your appointment is confirmed."
    });
    expect(assessConversationalAction(action)).toMatchObject({
      riskLevel: "medium",
      requiresExplicitApproval: true,
      requiresSecondaryConfirmation: false,
      reversible: false
    });
  });

  it("keeps external and high-impact actions read-only on a standard-trust call", () => {
    expect(conversationalActionNeedsStrongAuthentication("medium", "standard")).toBe(true);
    expect(conversationalActionNeedsStrongAuthentication("high", "standard")).toBe(true);
    expect(conversationalActionNeedsStrongAuthentication("low", "standard")).toBe(false);
    expect(conversationalActionNeedsStrongAuthentication("high", "strong")).toBe(false);
  });

  it("requires a second confirmation for pricing and schedule changes", () => {
    const estimate = conversationalActionSchema.parse({
      type: "update_estimate",
      estimateId: "9e81e025-1603-47f9-a822-2dc9ff9fd79f",
      adjustmentPercent: 8,
      explanation: "Owner requested an eight percent increase."
    });
    const schedule = conversationalActionSchema.parse({
      type: "reschedule_job",
      jobId: "f3fd1d1b-e666-49bf-b59e-b10e7b33bd44",
      startsAt: "2026-08-06T15:00:00.000Z"
    });
    expect(assessConversationalAction(estimate).requiresSecondaryConfirmation).toBe(true);
    expect(assessConversationalAction(schedule).requiresSecondaryConfirmation).toBe(true);
  });

  it("rejects vague or unsupported provider payloads", () => {
    expect(conversationalActionSchema.safeParse({ type: "do_everything", command: "handle it" }).success).toBe(false);
  });

  it("accepts only contact preferences Ferocity can actually save", () => {
    expect(conversationalActionSchema.safeParse({
      type: "update_contact_preference",
      contactType: "customer",
      contactId: "d3b7755f-3d0d-4c93-9f1c-a1a0a2f78be9",
      preference: "no_marketing_sms",
      value: true
    }).success).toBe(true);
    expect(conversationalActionSchema.safeParse({
      type: "update_contact_preference",
      contactType: "customer",
      contactId: "d3b7755f-3d0d-4c93-9f1c-a1a0a2f78be9",
      preference: "restore_customer_consent",
      value: true
    }).success).toBe(false);
  });

  it("rounds estimate adjustments to whole cents and never creates negative prices", () => {
    expect(adjustedCents(10_001, 8)).toBe(10_801);
    expect(adjustedCents(10_001, -100)).toBe(0);
  });

  it("rejects backward or malformed reschedule windows before touching the database", () => {
    expect(validScheduleWindow("2026-08-06T15:00:00.000Z", "2026-08-06T17:00:00.000Z")).toBe(true);
    expect(validScheduleWindow("2026-08-06T15:00:00.000Z", "2026-08-06T14:00:00.000Z")).toBe(false);
    expect(validScheduleWindow("not-a-date")).toBe(false);
  });
});
