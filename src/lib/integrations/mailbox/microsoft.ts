import type { MailboxAdapter, NormalizedMailboxMessage } from "./types";

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  id: string; conversationId?: string; internetMessageId?: string; subject?: string; bodyPreview?: string;
  body?: { contentType?: string; content?: string }; receivedDateTime?: string; isRead?: boolean; hasAttachments?: boolean;
  importance?: string; categories?: string[]; from?: GraphAddress; toRecipients?: GraphAddress[]; webLink?: string;
};

function cleanBody(message: GraphMessage) {
  const content = message.body?.content ?? "";
  return message.body?.contentType?.toLowerCase() === "html"
    ? content.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50_000)
    : content.slice(0, 50_000);
}

export function normalizeMicrosoftMessage(message: GraphMessage): NormalizedMailboxMessage {
  const from = message.from?.emailAddress;
  return {
    providerMessageId: message.id,
    providerThreadId: message.conversationId ?? null,
    internetMessageId: message.internetMessageId ?? null,
    sender: { name: from?.name, email: from?.address },
    recipients: (message.toRecipients ?? []).map((item) => ({ name: item.emailAddress?.name, email: item.emailAddress?.address })),
    subject: message.subject ?? "(No subject)", preview: message.bodyPreview ?? "", bodyText: cleanBody(message),
    receivedAt: message.receivedDateTime ?? new Date().toISOString(), isRead: message.isRead ?? false,
    hasAttachments: message.hasAttachments ?? false, importance: message.importance ?? null,
    labels: message.categories ?? [], sourceUrl: message.webLink ?? null, rawMetadata: {}
  };
}

export const microsoftMailboxAdapter: MailboxAdapter = {
  key: "microsoft_mailbox",
  async fetchRecent({ accessToken, cursor, limit = 25, fetchImpl = fetch }) {
    const url = cursor ? new URL(cursor) : new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
    if (!cursor) {
      url.searchParams.set("$top", String(Math.min(Math.max(limit, 1), 50)));
      url.searchParams.set("$orderby", "receivedDateTime desc");
      url.searchParams.set("$select", "id,conversationId,internetMessageId,subject,bodyPreview,body,receivedDateTime,isRead,hasAttachments,importance,categories,from,toRecipients,webLink");
    }
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, prefer: 'outlook.body-content-type="text"' }, cache: "no-store" });
    const body = await response.json().catch(() => null) as { value?: GraphMessage[]; "@odata.nextLink"?: string; error?: { message?: string } } | null;
    if (!response.ok) throw new Error(body?.error?.message || "Microsoft mailbox sync failed.");
    return { messages: (body?.value ?? []).map(normalizeMicrosoftMessage), nextCursor: body?.["@odata.nextLink"] ?? null };
  }
};
