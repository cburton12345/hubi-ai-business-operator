import { describe, expect, it } from "vitest";
import { normalizeOAuthReturnTo, oauthAppRedirect, onboardingOAuthStartPath } from "./oauth-return";

describe("onboardingOAuthStartPath", () => {
  it("returns a connected provider to conversational onboarding", () => {
    const path = onboardingOAuthStartPath("/api/integrations/gmail_mailbox/oauth/start", {
      provider: "gmail_mailbox",
      destination: "email",
    });
    const url = new URL(path, "https://ferocity.live");
    expect(url.pathname).toBe("/api/integrations/gmail_mailbox/oauth/start");
    expect(url.searchParams.get("returnTo")).toContain("/app/ferocity?onboarding=1");
    expect(url.searchParams.get("returnTo")).toContain("newly connected inbox");
  });

  it("returns calendar OAuth to calendar selection before discovery", () => {
    const path = onboardingOAuthStartPath("/api/integrations/google_calendar/oauth/start", {
      provider: "google_calendar",
      destination: "calendar",
    });
    expect(new URL(path, "https://ferocity.live").searchParams.get("returnTo"))
      .toBe("/app/integrations/calendar?onboarding=1");
  });

  it("accepts only local app destinations", () => {
    expect(normalizeOAuthReturnTo("/app/ferocity?onboarding=1")).toBe("/app/ferocity?onboarding=1");
    expect(normalizeOAuthReturnTo("https://evil.example/app/ferocity")).toBe("/app/integrations");
    expect(normalizeOAuthReturnTo("//evil.example/app")).toBe("/app/integrations");
    expect(normalizeOAuthReturnTo("/app/\\evil.example")).toBe("/app/integrations");
    expect(normalizeOAuthReturnTo("/support")).toBe("/app/integrations");
  });

  it("adds callback status without losing the initiating onboarding query", () => {
    const response = oauthAppRedirect(
      new Request("https://ferocity.live/api/integrations/google/oauth/callback"),
      { provider: "google", setup: "connected" },
      "/app/ferocity?onboarding=1&command=continue",
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/app/ferocity");
    expect(location.searchParams.get("onboarding")).toBe("1");
    expect(location.searchParams.get("command")).toBe("continue");
    expect(location.searchParams.get("setup")).toBe("connected");
  });
});
