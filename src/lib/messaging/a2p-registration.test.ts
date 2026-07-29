import { describe, expect, it } from "vitest";
import { generateA2pRegistrationPacket } from "./a2p-registration";

describe("generateA2pRegistrationPacket", () => {
  it("creates plain compliance wording with STOP and HELP language", () => {
    const packet = generateA2pRegistrationPacket({
      legalBusinessName: "Sample Roofing LLC",
      businessType: "LLC",
      addressLine1: "123 Main St",
      city: "Eau Claire",
      state: "WI",
      postalCode: "54701",
      websiteUrl: "https://example.com",
      messagingUseCase: "lead follow-up and appointment reminders",
      expectedVolume: "10-40 per month",
      optInMethod: "website form"
    });

    expect(packet.campaignDescription).toContain("Sample Roofing LLC");
    expect(packet.optInWording).toContain("Reply STOP");
    expect(packet.stopHelpWording.help).toContain("STOP");
    expect(packet.sampleMessages).toHaveLength(2);
  });
});
