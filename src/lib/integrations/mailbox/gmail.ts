import type { MailboxAdapter, NormalizedMailboxMessage } from "./types";

type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; threadId?: string; internalDate?: string; labelIds?: string[]; snippet?: string; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } };

function decode(data?: string) {
  if (!data) return "";
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return ""; }
}

function textFromPart(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  return (part.parts ?? []).map(textFromPart).filter(Boolean).join("\n");
}

function address(value = "") {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  return match ? { name: match[1].replace(/^"|"$/g, "").trim(), email: match[2].trim() } : { email: value.trim() };
}

export function normalizeGmailMessage(message: GmailMessage): NormalizedMailboxMessage {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((item) => [item.name.toLowerCase(), item.value]));
  const labels = message.labelIds ?? [];
  return {
    providerMessageId: message.id,
    providerThreadId: message.threadId ?? null,
    internetMessageId: headers["message-id"] ?? null,
    sender: address(headers.from),
    recipients: (headers.to ?? "").split(",").filter(Boolean).map(address),
    subject: headers.subject ?? "(No subject)",
    preview: message.snippet ?? "",
    bodyText: textFromPart(message.payload).slice(0, 50_000),
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date(headers.date ?? Date.now()).toISOString(),
    isRead: !labels.includes("UNREAD"),
    hasAttachments: JSON.stringify(message.payload ?? {}).includes('"filename":"') && !JSON.stringify(message.payload ?? {}).includes('"filename":""'),
    importance: labels.includes("IMPORTANT") ? "high" : null,
    labels,
    sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
    rawMetadata: { sizeEstimate: undefined }
  };
}

export const gmailMailboxAdapter: MailboxAdapter = {
  key: "gmail_mailbox",
  async fetchRecent({ accessToken, cursor, limit = 25, fetchImpl = fetch }) {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 50)));
    listUrl.searchParams.set("q", "in:inbox newer_than:30d");
    if (cursor) listUrl.searchParams.set("pageToken", cursor);
    const listResponse = await fetchImpl(listUrl, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const listBody = await listResponse.json().catch(() => null) as { messages?: Array<{ id: string }>; nextPageToken?: string; error?: { message?: string } } | null;
    if (!listResponse.ok) throw new Error(listBody?.error?.message || "Gmail sync failed.");
    const messages = await Promise.all((listBody?.messages ?? []).map(async ({ id }) => {
      const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const body = await response.json().catch(() => null) as GmailMessage | null;
      if (!response.ok || !body?.id) throw new Error("Gmail message retrieval failed.");
      return normalizeGmailMessage(body);
    }));
    return { messages, nextCursor: listBody?.nextPageToken ?? null };
  }
};
