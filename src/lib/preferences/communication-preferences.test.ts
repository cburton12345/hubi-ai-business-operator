import { describe, expect, it } from "vitest";
import {
  automaticCommunicationRequiresConsent,
  communicationPreferenceScopes,
  communicationRoute
} from "./communication-preferences";

describe("communication preferences", () => {
  it("orders contact, workflow, user, then organization", () => {
    expect(communicationPreferenceScopes({
      contactKey: "+15551234567",
      workflowKey: "estimate_follow_up",
      userId: "user-1"
    })).toEqual([
      { type: "contact", key: "+15551234567" },
      { type: "workflow", key: "estimate_follow_up" },
      { type: "user", key: "user-1" },
      { type: "organization", key: "default" }
    ]);
  });

  it("keeps voice, automated SMS, assisted messaging, and email distinct", () => {
    expect(communicationRoute("ai_voice_call")).toMatchObject({ actionType: "voice_call", channel: "phone" });
    expect(communicationRoute("native_sms")).toMatchObject({ providerKey: "manual_sms", channel: "manual_sms" });
    expect(communicationRoute("google_voice")).toMatchObject({ providerKey: "google_voice_manual", channel: "manual_sms" });
    expect(communicationRoute("email")).toMatchObject({ providerKey: null, channel: "email" });
  });

  it("does not treat assisted sending as an automated provider send", () => {
    expect(automaticCommunicationRequiresConsent("automatic_sms")).toBe(true);
    expect(automaticCommunicationRequiresConsent("ai_voice_call")).toBe(true);
    expect(automaticCommunicationRequiresConsent("native_sms")).toBe(false);
    expect(automaticCommunicationRequiresConsent("copy_message")).toBe(false);
  });
});
