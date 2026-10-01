export type MailboxProviderKey = "gmail_mailbox" | "microsoft_mailbox";

export type NormalizedMailboxMessage = {
  providerMessageId: string;
  providerThreadId: string | null;
  internetMessageId: string | null;
  sender: { name?: string; email?: string };
  recipients: Array<{ name?: string; email?: string }>;
  subject: string;
  preview: string;
  bodyText: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance: string | null;
  labels: string[];
  sourceUrl: string | null;
  rawMetadata: Record<string, unknown>;
};

export type MailboxFetchResult = {
  messages: NormalizedMailboxMessage[];
  nextCursor: string | null;
};

export interface MailboxAdapter {
  readonly key: MailboxProviderKey;
  fetchRecent(input: { accessToken: string; cursor?: string | null; limit?: number; fetchImpl?: typeof fetch }): Promise<MailboxFetchResult>;
}
