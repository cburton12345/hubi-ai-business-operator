import { describe, expect, it } from "vitest";
import { classifyMailboxMessage } from "./classification";
import { normalizeGmailMessage } from "./gmail";
import { normalizeMicrosoftMessage } from "./microsoft";

describe("customer mailbox normalization", () => {
  it("normalizes Gmail without authorizing a send action", () => {
    const message = normalizeGmailMessage({
      id: "gmail-1", threadId: "thread-1", internalDate: "1788900000000", labelIds: ["INBOX", "UNREAD"], snippet: "Could I get an estimate?",
      payload: { mimeType: "text/plain", headers: [
        { name: "From", value: "Taylor <taylor@example.com>" }, { name: "To", value: "office@example.com" },
        { name: "Subject", value: "Roof estimate" }, { name: "Message-ID", value: "<one@example.com>" }
      ], body: { data: Buffer.from("Please send a quote.").toString("base64url") } }
    });
    expect(message.sender.email).toBe("taylor@example.com");
    expect(message.isRead).toBe(false);
    expect(message.bodyText).toContain("quote");
  });

  it("normalizes Microsoft Graph messages", () => {
    const message = normalizeMicrosoftMessage({
      id: "ms-1", subject: "Invoice question", bodyPreview: "Can you help?", body: { contentType: "html", content: "<p>Payment question</p>" },
      receivedDateTime: "2026-09-09T12:00:00Z", from: { emailAddress: { name: "Morgan", address: "morgan@example.com" } },
      toRecipients: [{ emailAddress: { address: "office@example.com" } }], categories: ["Customer"]
    });
    expect(message.sender.name).toBe("Morgan");
    expect(message.bodyText).toBe("Payment question");
    expect(message.labels).toEqual(["Customer"]);
  });

  it("flags leads, money, support, and urgent messages for attention", () => {
    expect(classifyMailboxMessage({ subject: "Need an estimate" })).toMatchObject({ classification: "lead", needsAttention: true });
    expect(classifyMailboxMessage({ subject: "Past due invoice" })).toMatchObject({ classification: "finance", needsAttention: true });
    expect(classifyMailboxMessage({ bodyText: "There is an emergency water leak" })).toMatchObject({ classification: "urgent", needsAttention: true });
    expect(classifyMailboxMessage({ subject: "Monthly newsletter" })).toMatchObject({ classification: "other", needsAttention: false });
  });
});
