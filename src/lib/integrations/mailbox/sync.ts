import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { classifyMailboxMessage } from "./classification";
import { gmailMailboxAdapter } from "./gmail";
import { microsoftMailboxAdapter } from "./microsoft";
import type { MailboxProviderKey } from "./types";

const adapters = { gmail_mailbox: gmailMailboxAdapter, microsoft_mailbox: microsoftMailboxAdapter } as const;

type ConnectionRow = { id: string; provider_key: MailboxProviderKey; sync_cursor: string | null; read_enabled: boolean };

export async function syncMailbox(input: { tenantId: string; provider: MailboxProviderKey; fetchImpl?: typeof fetch; limit?: number }) {
  const found = await queryPostgres<ConnectionRow>(
    `select id,provider_key,sync_cursor,read_enabled from public.mailbox_connections where tenant_id=$1 and provider_key=$2 and status <> 'disconnected'`,
    [input.tenantId, input.provider]
  );
  const connection = found?.rows[0];
  if (!connection || !connection.read_enabled) throw new Error("Connect this inbox before syncing it.");
  const run = await queryPostgres<{ id: string }>(
    `insert into public.mailbox_sync_runs(tenant_id,connection_id,status) values($1,$2,'running') returning id`,
    [input.tenantId, connection.id]
  );
  const runId = run?.rows[0]?.id;
  if (!runId) throw new Error("Ferocity could not start a mailbox sync audit record.");
  await queryPostgres(`update public.mailbox_connections set status='syncing',last_error=null,updated_at=now() where id=$1`, [connection.id]);
  try {
    const accessToken = await getFreshProviderAccessToken(input.tenantId, input.provider, input.fetchImpl ?? fetch);
    const result = await adapters[input.provider].fetchRecent({
      accessToken,
      // Page cursors are intentionally not reused for ordinary refreshes. Each run
      // checks the newest messages and idempotent upserts avoid duplicates.
      cursor: null,
      limit: input.limit ?? 25,
      fetchImpl: input.fetchImpl
    });
    let saved = 0;
    for (const message of result.messages) {
      const classification = classifyMailboxMessage(message);
      const upserted = await queryPostgres(
        `insert into public.mailbox_messages(
          tenant_id,connection_id,provider_message_id,provider_thread_id,internet_message_id,direction,
          sender_json,recipients_json,subject,preview,body_text,received_at,is_read,has_attachments,
          importance,labels_json,classification,confidence,action_status,source_url,raw_metadata_json
        ) values($1,$2,$3,$4,$5,'inbound',$6::jsonb,$7::jsonb,$8,$9,$10,$11::timestamptz,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb)
        on conflict(connection_id,provider_message_id) do update set
          is_read=excluded.is_read, labels_json=excluded.labels_json, updated_at=now()
        returning id`,
        [input.tenantId, connection.id, message.providerMessageId, message.providerThreadId, message.internetMessageId,
          JSON.stringify(message.sender), JSON.stringify(message.recipients), message.subject, message.preview, message.bodyText,
          message.receivedAt, message.isRead, message.hasAttachments, message.importance, JSON.stringify(message.labels),
          classification.classification, classification.confidence, classification.needsAttention ? "needs_attention" : "unreviewed",
          message.sourceUrl, JSON.stringify(message.rawMetadata)]
      );
      if (!upserted?.rowCount) throw new Error("Ferocity could not safely save a mailbox message.");
      saved += 1;
    }
    await queryPostgres(
      `update public.mailbox_connections set status='connected',sync_cursor=$2,last_synced_at=now(),last_error=null,updated_at=now() where id=$1`,
      [connection.id, result.nextCursor]
    );
    if (runId) await queryPostgres(
      `update public.mailbox_sync_runs set status='completed',messages_seen=$2,messages_saved=$3,completed_at=now() where id=$1`,
      [runId, result.messages.length, saved]
    );
    return { provider: input.provider, seen: result.messages.length, saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed.";
    await queryPostgres(`update public.mailbox_connections set status='needs_attention',last_error=$2,updated_at=now() where id=$1`, [connection.id, message]);
    if (runId) await queryPostgres(`update public.mailbox_sync_runs set status='failed',safe_error_message=$2,completed_at=now() where id=$1`, [runId, message]);
    throw error;
  }
}
