import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { classifyMailboxMessage } from "./classification";
import { gmailMailboxAdapter } from "./gmail";
import { microsoftMailboxAdapter } from "./microsoft";
import type { MailboxProviderKey } from "./types";

const adapters = { gmail_mailbox: gmailMailboxAdapter, microsoft_mailbox: microsoftMailboxAdapter } as const;

type ConnectionRow = { id: string; provider_key: MailboxProviderKey; sync_cursor: string | null; read_enabled: boolean };

const STALE_SYNC_INTERVAL = "20 minutes";
const MESSAGE_SAVE_ATTEMPTS = 2;

export class MailboxSyncInProgressError extends Error {
  constructor() {
    super("Mailbox synchronization is already in progress.");
    this.name = "MailboxSyncInProgressError";
  }
}

async function saveMailboxMessage(values: unknown[]) {
  for (let attempt = 1; attempt <= MESSAGE_SAVE_ATTEMPTS; attempt += 1) {
    const upserted = await queryPostgres(
      `insert into public.mailbox_messages(
        tenant_id,connection_id,provider_message_id,provider_thread_id,internet_message_id,direction,
        sender_json,recipients_json,subject,preview,body_text,received_at,is_read,has_attachments,
        importance,labels_json,classification,confidence,action_status,source_url,raw_metadata_json
      ) values($1,$2,$3,$4,$5,'inbound',$6::jsonb,$7::jsonb,$8,$9,$10,$11::timestamptz,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb)
      on conflict(connection_id,provider_message_id) do update set
        provider_thread_id=excluded.provider_thread_id,
        internet_message_id=excluded.internet_message_id,
        sender_json=excluded.sender_json,
        recipients_json=excluded.recipients_json,
        subject=excluded.subject,
        preview=excluded.preview,
        body_text=excluded.body_text,
        received_at=excluded.received_at,
        is_read=excluded.is_read,
        has_attachments=excluded.has_attachments,
        importance=excluded.importance,
        labels_json=excluded.labels_json,
        classification=excluded.classification,
        confidence=excluded.confidence,
        action_status=case
          when public.mailbox_messages.action_status in ('reviewed','archived') then public.mailbox_messages.action_status
          else excluded.action_status
        end,
        source_url=excluded.source_url,
        raw_metadata_json=excluded.raw_metadata_json,
        updated_at=now()
      returning id`,
      values
    );
    if (upserted?.rowCount) return;
    if (attempt < MESSAGE_SAVE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw new Error("Ferocity could not safely save a mailbox message.");
}

export async function syncMailbox(input: { tenantId: string; provider: MailboxProviderKey; fetchImpl?: typeof fetch; limit?: number }) {
  const found = await queryPostgres<ConnectionRow>(
    `select id,provider_key,sync_cursor,read_enabled from public.mailbox_connections where tenant_id=$1 and provider_key=$2 and status <> 'disconnected'`,
    [input.tenantId, input.provider]
  );
  const connection = found?.rows[0];
  if (!connection || !connection.read_enabled) throw new Error("Connect this inbox before syncing it.");

  const claimed = await queryPostgres<ConnectionRow>(
    `update public.mailbox_connections
     set status='syncing',last_error=null,updated_at=now()
     where id=$1 and read_enabled=true and status <> 'disconnected'
       and (
         status in ('connected','needs_attention')
         or (status='syncing' and updated_at < now() - $2::interval)
       )
     returning id,provider_key,sync_cursor,read_enabled`,
    [connection.id, STALE_SYNC_INTERVAL]
  );
  if (!claimed?.rows[0]) throw new MailboxSyncInProgressError();

  await queryPostgres(
    `update public.mailbox_sync_runs
     set status='failed',safe_error_message='Mailbox synchronization was interrupted and safely retried.',completed_at=now()
     where connection_id=$1 and status='running' and started_at < now() - $2::interval`,
    [connection.id, STALE_SYNC_INTERVAL]
  );

  const run = await queryPostgres<{ id: string }>(
    `insert into public.mailbox_sync_runs(tenant_id,connection_id,status) values($1,$2,'running') returning id`,
    [input.tenantId, connection.id]
  );
  const runId = run?.rows[0]?.id;
  if (!runId) {
    await queryPostgres(
      `update public.mailbox_connections
       set status='needs_attention',last_error='Mailbox synchronization could not start safely.',updated_at=now()
       where id=$1 and status='syncing'`,
      [connection.id]
    );
    throw new Error("Ferocity could not start a mailbox sync audit record.");
  }
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
      if (!message.providerMessageId || !message.receivedAt || Number.isNaN(Date.parse(message.receivedAt))) {
        throw new Error("The mailbox provider returned an invalid message record.");
      }
      const classification = classifyMailboxMessage(message);
      await saveMailboxMessage(
        [input.tenantId, connection.id, message.providerMessageId, message.providerThreadId, message.internetMessageId,
          JSON.stringify(message.sender), JSON.stringify(message.recipients), message.subject, message.preview, message.bodyText,
          message.receivedAt, message.isRead, message.hasAttachments, message.importance, JSON.stringify(message.labels),
          classification.classification, classification.confidence, classification.needsAttention ? "needs_attention" : "unreviewed",
          message.sourceUrl, JSON.stringify(message.rawMetadata)]
      );
      saved += 1;
    }
    const connectionUpdated = await queryPostgres(
      `update public.mailbox_connections set status='connected',sync_cursor=$2,last_synced_at=now(),last_error=null,updated_at=now() where id=$1`,
      [connection.id, result.nextCursor]
    );
    if (!connectionUpdated?.rowCount) throw new Error("Ferocity could not safely complete mailbox synchronization.");
    const runUpdated = await queryPostgres(
      `update public.mailbox_sync_runs set status='completed',messages_seen=$2,messages_saved=$3,completed_at=now() where id=$1`,
      [runId, result.messages.length, saved]
    );
    if (!runUpdated?.rowCount) throw new Error("Ferocity could not safely complete the mailbox audit record.");
    return { provider: input.provider, seen: result.messages.length, saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed.";
    await queryPostgres(
      `update public.mailbox_connections set status='needs_attention',last_error=$2,updated_at=now() where id=$1 and status='syncing'`,
      [connection.id, message]
    );
    await queryPostgres(`update public.mailbox_sync_runs set status='failed',safe_error_message=$2,completed_at=now() where id=$1 and status='running'`, [runId, message]);
    throw error;
  }
}
