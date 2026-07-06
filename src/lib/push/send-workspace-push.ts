import type { PushSubscription } from "web-push";
import { queryPostgres } from "@/lib/db/postgres";
import { getPushReadiness, sendPushNotification } from "@/lib/push/web-push";

type SendWorkspacePushInput = {
  tenantId: string;
  recipientUserId?: string | null;
  eventType: string;
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  tenant_id: string;
  user_id: string | null;
};

export type WorkspacePushResult = {
  ok: boolean;
  skipped: boolean;
  sent: number;
  failed: number;
  subscriptionCount: number;
  missing: string[];
};

function safeActionUrl(url?: string | null) {
  if (!url) return "/app/owner-command-center";
  if (url.startsWith("/")) return url;
  return "/app/owner-command-center";
}

export async function sendWorkspacePushNotifications(input: SendWorkspacePushInput): Promise<WorkspacePushResult> {
  const subscriptions = await queryPostgres<PushSubscriptionRow>(
    `
    select id, endpoint, p256dh_key, auth_key, tenant_id, user_id
    from public.push_subscriptions
    where (tenant_id = $1 or ($2::uuid is not null and user_id = $2))
      and status = 'active'
      and ($2::uuid is null or user_id = $2 or user_id is null)
    order by updated_at desc
    limit $3
    `,
    [input.tenantId, input.recipientUserId ?? null, input.limit ?? 25]
  );

  const rows = subscriptions?.rows ?? [];
  const actionUrl = safeActionUrl(input.url);
  const metadata = {
    ...(input.metadata ?? {}),
    tag: input.tag ?? null
  };

  if (rows.length === 0) {
    return { ok: false, skipped: true, sent: 0, failed: 0, subscriptionCount: 0, missing: [] };
  }

  const readiness = getPushReadiness();
  if (!readiness.ready) {
    await queryPostgres(
      `
      insert into public.push_notification_events (
        tenant_id, user_id, event_type, title, body, action_url, status, error_message, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, 'skipped', $7, $8::jsonb)
      `,
      [
        input.tenantId,
        input.recipientUserId ?? null,
        input.eventType,
        input.title,
        input.body,
        actionUrl,
        `Missing ${readiness.missing.join(", ")}`,
        JSON.stringify({ ...metadata, missing: readiness.missing, subscriptionCount: rows.length })
      ]
    );

    return {
      ok: false,
      skipped: true,
      sent: 0,
      failed: 0,
      subscriptionCount: rows.length,
      missing: readiness.missing
    };
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await sendPushNotification({
      subscription: {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh_key,
          auth: row.auth_key
        }
      } satisfies PushSubscription,
      title: input.title,
      body: input.body,
      url: actionUrl,
      tag: input.tag ?? input.eventType
    });

    await queryPostgres(
      `
      insert into public.push_notification_events (
        tenant_id, subscription_id, user_id, event_type, title, body, action_url, status,
        provider_response, error_message, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        input.tenantId,
        row.id,
        row.user_id,
        input.eventType,
        input.title,
        input.body,
        actionUrl,
        result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        result.message,
        result.ok ? null : result.message,
        JSON.stringify({ ...metadata, statusCode: result.statusCode })
      ]
    );

    if (result.ok) {
      sent += 1;
      await queryPostgres(`update public.push_subscriptions set last_success_at = now(), last_error = null where id = $1`, [row.id]);
    } else {
      failed += 1;
      await queryPostgres(
        `
        update public.push_subscriptions
        set status = case when $2::int in (404, 410) then 'expired' else 'failed' end,
            last_error = $3
        where id = $1
        `,
        [row.id, result.statusCode, result.message]
      );
    }
  }

  return {
    ok: sent > 0,
    skipped: false,
    sent,
    failed,
    subscriptionCount: rows.length,
    missing: []
  };
}
