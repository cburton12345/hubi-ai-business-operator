import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSmsWithTwilio } from "./twilio";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tenant Twilio sending", () => {
  it("uses the tenant account endpoint and API-key authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSmsWithTwilio({
      to: "+15550001111",
      body: "Hello",
      configuration: {
        ownershipMode: "customer_owned",
        accountSid: "ACtenant",
        authUsername: "SKrestricted",
        authPassword: "api-secret",
        webhookAuthToken: "auth-token",
        fromNumber: "+15550002222",
        messagingServiceSid: null
      }
    });

    expect(result).toEqual({ ok: true, providerMessageId: "SM123" });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/Accounts/ACtenant/Messages.json");
    expect((options.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("SKrestricted:api-secret").toString("base64")}`
    );
    expect(String(options.body)).toContain("From=%2B15550002222");
  });
});
