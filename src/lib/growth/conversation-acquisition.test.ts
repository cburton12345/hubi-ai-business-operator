import { describe, expect, it } from "vitest";
import { acquisitionTokenPattern, buildConversationDestination } from "./conversation-acquisition";

describe("direct conversation acquisition", () => {
  it("recognizes a deterministic attribution token without accepting short lookalikes", () => {
    expect("Can you help? FRC-AB12CD34EF56".match(acquisitionTokenPattern)?.[1]).toBe("AB12CD34EF56");
    expect("FRC-TOO-SHORT".match(acquisitionTokenPattern)).toBeNull();
  });

  it("builds an SMS destination with a prefilled customer message", () => {
    expect(buildConversationDestination({
      channel: "sms",
      destination: "+1 715 555 1212",
      message: "I need an estimate\n\nFRC-AB12CD34EF56",
      fallbackUrl: null
    })).toBe("sms:+17155551212?body=I%20need%20an%20estimate%0A%0AFRC-AB12CD34EF56");
  });

  it("uses an explicit fallback for provider channels without a native deep link", () => {
    expect(buildConversationDestination({
      channel: "website_chat",
      destination: null,
      message: "Hello",
      fallbackUrl: "https://example.com/contact"
    })).toBe("https://example.com/contact");
  });
});
