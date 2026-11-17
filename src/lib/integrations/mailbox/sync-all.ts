import { queryPostgres } from "@/lib/db/postgres";
import { MailboxSyncInProgressError, syncMailbox } from "./sync";
import type { MailboxProviderKey } from "./types";

type DueMailbox = { tenant_id: string; provider_key: MailboxProviderKey };

const STALE_SYNC_INTERVAL = "20 minutes";

export async function syncDueMailboxes(input: { limit?: number; concurrency?: number } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const concurrency = Math.min(Math.max(input.concurrency ?? 3, 1), 6);
  const due = await queryPostgres<DueMailbox>(
    `select tenant_id,provider_key from public.mailbox_connections
     where read_enabled=true and (
       status in ('connected','needs_attention')
       or (status='syncing' and updated_at < now() - $2::interval)
     )
       and (last_synced_at is null or last_synced_at < now() - interval '10 minutes')
     order by last_synced_at nulls first limit $1`, [limit, STALE_SYNC_INTERVAL]
  );
  const rows = due?.rows ?? [];
  const failures: Array<{ tenantId: string; provider: MailboxProviderKey; message: string }> = [];
  let synced = 0;
  let messagesSeen = 0;
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex++]!;
      try {
        const result = await syncMailbox({ tenantId: row.tenant_id, provider: row.provider_key, limit: 25 });
        synced += 1;
        messagesSeen += result.seen;
      } catch (error) {
        if (error instanceof MailboxSyncInProgressError) continue;
        failures.push({ tenantId: row.tenant_id, provider: row.provider_key, message: error instanceof Error ? error.message : "Mailbox sync failed." });
      }
    }
  }));
  return { checked: rows.length, synced, messagesSeen, failures };
}
