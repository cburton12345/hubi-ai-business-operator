import { manualSmsHref } from "@/lib/communication/manual-sms";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ManualTextQueueRow = {
  id: string;
  subject: string;
  targetType: string;
  recipient: string;
  body: string;
  attempt: number;
  status: string;
  scheduledFor: string;
  smsHref: string;
};

export type ManualTextQueueDashboard = {
  metrics: {
    readyTexts: number;
    leadTexts: number;
    invoiceTexts: number;
    cappedItems: number;
  };
  rows: ManualTextQueueRow[];
};

function dateLabel(value: string | null) {
  if (!value) return "Now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export async function getManualTextQueue(): Promise<ManualTextQueueDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [metrics, rows] = await Promise.all([
    queryPostgres<{
      ready_texts: string;
      lead_texts: string;
      invoice_texts: string;
      capped_items: string;
    }>(
      `
      with sent_counts as (
        select tenant_id, target_type, target_id, count(*)::int as sent_count
        from public.outbound_action_queue
        where tenant_id = $1
          and action_type = 'sms_send'
          and provider_key = 'manual_sms'
          and status = 'sent_manually'
        group by tenant_id, target_type, target_id
      )
      select
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and action_type = 'sms_send' and provider_key = 'manual_sms' and status in ('needs_review','approved','queued'))::text as ready_texts,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and action_type = 'sms_send' and provider_key = 'manual_sms' and target_type = 'lead' and status in ('needs_review','approved','queued'))::text as lead_texts,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and action_type = 'sms_send' and provider_key = 'manual_sms' and target_type = 'service_invoice' and status in ('needs_review','approved','queued'))::text as invoice_texts,
        (select count(*) from sent_counts where sent_count >= 3)::text as capped_items
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      subject: string | null;
      target_type: string | null;
      recipient_label: string | null;
      body: string | null;
      attempt_number: string | null;
      status: string;
      scheduled_for: string | null;
    }>(
      `
      select
        id,
        subject,
        target_type,
        recipient_label,
        payload_json->>'body' as body,
        metadata_json->>'attemptNumber' as attempt_number,
        status,
        scheduled_for
      from public.outbound_action_queue
      where tenant_id = $1
        and action_type = 'sms_send'
        and provider_key = 'manual_sms'
        and status in ('needs_review','approved','queued')
      order by
        case target_type when 'service_invoice' then 1 when 'lead' then 2 else 3 end,
        coalesce(scheduled_for, created_at) asc
      limit 80
      `,
      [tenantId]
    )
  ]);

  const metricRow = metrics?.rows[0];
  const queueRows = rows?.rows ?? [];

  return {
    metrics: {
      readyTexts: Number(metricRow?.ready_texts ?? 0),
      leadTexts: Number(metricRow?.lead_texts ?? 0),
      invoiceTexts: Number(metricRow?.invoice_texts ?? 0),
      cappedItems: Number(metricRow?.capped_items ?? 0)
    },
    rows: queueRows.map((row) => {
      const recipient = row.recipient_label ?? "";
      const body = row.body ?? "";
      return {
        id: row.id,
        subject: row.subject ?? "Manual text",
        targetType: row.target_type ?? "unknown",
        recipient,
        body,
        attempt: Number(row.attempt_number ?? 1),
        status: row.status,
        scheduledFor: dateLabel(row.scheduled_for),
        smsHref: manualSmsHref(recipient, body)
      };
    })
  };
}
