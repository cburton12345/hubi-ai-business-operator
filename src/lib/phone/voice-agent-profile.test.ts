import { describe, expect, it } from "vitest";
import {
  buildVoiceAgentSystemPrompt,
  linesFromText,
  voiceProfileFromStored
} from "./voice-agent-profile";

describe("voice agent business profile", () => {
  it("combines workspace customization with industry knowledge without provider wording", () => {
    const profile = voiceProfileFromStored({
      displayName: "Taylor",
      roleSummary: "Help customers schedule roofing inspections.",
      tone: "calm and practical",
      escalationRules: ["Escalate active leaks immediately."],
      guardrails: ["Never promise insurance coverage."],
      metadata: {
        voiceGreeting: "Thanks for calling Summit Roofing. How can Taylor help?",
        voiceLanguages: ["English", "Spanish"],
        voiceCallGoals: ["Capture the property address", "Offer an inspection"],
        voiceCustomInstructions: ["Ask whether water is entering the home"]
      }
    });
    const prompt = buildVoiceAgentSystemPrompt(profile, {
      moduleKey: "roofing_core",
      industryKey: "roofing",
      moduleName: "Roofing business operations",
      guardrails: ["Unsafe access requires human escalation."],
      items: [{
        category: "intake",
        title: "Roofing intake",
        content: "Collect roof age and symptoms.",
        riskLevel: "low",
        requiresVerification: false
      }]
    });

    expect(profile.greeting).toContain("Summit Roofing");
    expect(prompt).toContain("Roofing business operations");
    expect(prompt).toContain("Capture the property address");
    expect(prompt).toContain("English, Spanish");
    expect(prompt).not.toMatch(/Twilio|Vapi|Retell|Telnyx/);
  });

  it("turns simple owner text into bounded instruction lists", () => {
    expect(linesFromText("Book estimates\n- Never quote unseen work; Transfer emergencies")).toEqual([
      "Book estimates",
      "Never quote unseen work",
      "Transfer emergencies"
    ]);
  });
});
