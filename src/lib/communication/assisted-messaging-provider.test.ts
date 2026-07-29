import { describe, expect, it } from "vitest";
import { browserAssistedMessagingProvider } from "./assisted-messaging-provider";

describe("browser assisted messaging", () => {
  it("prepares native SMS, email, Google Voice, copy, and dialer actions without a live provider send", () => {
    expect(browserAssistedMessagingProvider.openNativeSMS("(555) 123-4567", "Hello there")).toContain("sms:5551234567");
    expect(browserAssistedMessagingProvider.openEmailDraft("owner@example.com", "Estimate", "Ready")).toContain("mailto:owner%40example.com");
    expect(browserAssistedMessagingProvider.openGoogleVoice()).toBe("https://voice.google.com/u/0/messages");
    expect(browserAssistedMessagingProvider.copyMessage("Ready")).toBe("Ready");
    expect(browserAssistedMessagingProvider.openDialer("+15551234567")).toBe("tel:+15551234567");
  });
});
