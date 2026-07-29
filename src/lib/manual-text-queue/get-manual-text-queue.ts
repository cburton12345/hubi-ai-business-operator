import { manualSmsHref } from "@/lib/communication/manual-sms";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import type { CommunicationMethod } from "@/lib/preferences/communication-preferences";
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
  email: string | null;
  resolvedMethod: CommunicationMethod;
  resolvedScope: string;
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
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
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
      email: string | null;
      resolved_method: CommunicationMethod | null;
      resolved_scope: string | null;
    }>(
      `
      select
        q.id,
        q.subject,
        q.target_type,
        q.recipient_label,
        q.payload_json->>'body' as body,
        q.metadata_json->>'attemptNumber' as attempt_number,
        q.status,
        q.scheduled_for,
        coalesce(l.email, invoice_customer.email) as email,
        pref.value_json->>'method' as resolved_method,
        pref.scope_type as resolved_scope
      from public.outbound_action_queue q
      left join public.leads l
        on l.tenant_id = q.tenant_id and l.id = q.target_id and q.target_type = 'lead'
      left join public.service_invoices invoice
        on invoice.tenant_id = q.tenant_id and invoice.id = q.target_id and q.target_type = 'service_invoice'
      left join public.customers invoice_customer
        on invoice_customer.tenant_id = invoice.tenant_id and invoice_customer.id = invoice.customer_id
      left join lateral (
        select
          case when p.preference_key = 'contact_profile'
            then jsonb_build_object('method', p.value_json->>'preferredMethod')
            else p.value_json
          end as value_json,
          p.scope_type
        from public.scoped_saved_preferences p
        where p.tenant_id = q.tenant_id
          and p.preference_domain = 'communication'
          and p.preference_key in ('delivery_method', 'contact_profile')
          and p.status = 'active'
          and (
            (
              p.scope_type = 'contact'
              and p.scope_key in (
                lower(coalesce(q.recipient_label, '')),
                case
                  when q.target_type = 'lead' and l.id is not null then 'lead:' || l.id::text
                  when invoice_customer.id is not null then 'customer:' || invoice_customer.id::text
                  else lower(coalesce(q.recipient_label, ''))
                end
              )
            )
            or (p.scope_type = 'workflow' and p.scope_key = lower(coalesce(nullif(q.metadata_json->>'queueType', ''), q.action_type)))
            or (p.scope_type = 'user' and p.scope_key = lower(coalesce($2::text, '')))
            or (p.scope_type = 'organization' and p.scope_key = 'default')
          )
        order by case p.scope_type
          when 'contact' then 400
          when 'workflow' then 300
          when 'user' then 200
          when 'organization' then 100
          else 0
        end desc,
        case p.preference_key when 'delivery_method' then 2 else 1 end desc,
        p.updated_at desc
        limit 1
      ) pref on true
      where q.tenant_id = $1
        and q.action_type = 'sms_send'
        and q.provider_key = 'manual_sms'
        and q.status in ('needs_review','approved','queued')
      order by
        case q.target_type when 'service_invoice' then 1 when 'lead' then 2 else 3 end,
        coalesce(q.scheduled_for, q.created_at) asc
      limit 80
      `,
      [tenantId, session?.userId ?? ""]
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
        smsHref: manualSmsHref(recipient, body),
        email: row.email,
        resolvedMethod: row.resolved_method ?? "native_sms",
        resolvedScope: row.resolved_scope ?? "this action"
      };
    })
  };
}
