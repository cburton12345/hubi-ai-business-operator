import { queryPostgres } from "@/lib/db/postgres";

export type PlatformActivityItem = {
  id: string;
  title: string;
  detail: string;
  status: string;
  occurredAt: string;
  supportIssueId?: string;
  contact?: string | null;
  summary?: string | null;
};

export async function getPlatformActivity() {
  const [metrics, pages, sources, subscriptions, support] = await Promise.all([
    queryPostgres<{
      views_24h: string; views_7d: string; views_30d: string;
      paid_30d: string; open_support: string;
    }>(
      `select
        (select count(*) from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '24 hours')::text views_24h,
        (select count(*) from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '7 days')::text views_7d,
        (select count(*) from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '30 days')::text views_30d,
        (select count(*) from public.access_requests where request_type='paid_checkout' and metadata_json->>'checkoutStatus'='paid_and_provisioned' and created_at >= now()-interval '30 days')::text paid_30d,
        (select count(*) from public.support_issue_queue where status in ('open','reviewing'))::text open_support`
    ),
    queryPostgres<{ path: string; views: string }>(
      `select path, count(*)::text views from public.public_site_events
       where event_type='page_view' and occurred_at >= now()-interval '30 days'
       group by path order by count(*) desc limit 10`
    ),
    queryPostgres<{ source: string; views: string }>(
      `select coalesce(nullif(campaign_source,''), nullif(referrer_host,''), 'direct') source, count(*)::text views
       from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '30 days'
       group by 1 order by count(*) desc limit 10`
    ),
    queryPostgres<{ id: string; company_name: string | null; email: string; requested_plan: string | null; status: string; created_at: Date }>(
      `select id, company_name, email, requested_plan, status, created_at
       from public.access_requests where request_type='paid_checkout'
       order by created_at desc limit 12`
    ),
    queryPostgres<{ id: string; requester_name: string | null; requester_email: string | null; requester_phone: string | null; subject: string | null; message: string; issue_type: string; status: string; created_at: Date }>(
      `select id, requester_name, requester_email, requester_phone, subject, message, issue_type, status, created_at
       from public.support_issue_queue order by created_at desc limit 12`
    )
  ]);
  const row = metrics?.rows[0];
  return {
    metrics: {
      views24h: Number(row?.views_24h ?? 0),
      views7d: Number(row?.views_7d ?? 0),
      views30d: Number(row?.views_30d ?? 0),
      paid30d: Number(row?.paid_30d ?? 0),
      openSupport: Number(row?.open_support ?? 0)
    },
    pages: (pages?.rows ?? []).map((item) => ({ label: item.path, value: Number(item.views) })),
    sources: (sources?.rows ?? []).map((item) => ({ label: item.source, value: Number(item.views) })),
    subscriptions: (subscriptions?.rows ?? []).map((item): PlatformActivityItem => ({
      id: item.id,
      title: item.company_name || item.email,
      detail: `${item.email} · ${item.requested_plan || "plan not recorded"}`,
      status: item.status,
      occurredAt: item.created_at.toISOString()
    })),
    support: (support?.rows ?? []).map((item): PlatformActivityItem => ({
      id: item.id,
      title: item.subject || "Support request",
      detail: `${item.requester_name || item.requester_email || "Customer"} · ${item.issue_type}`,
      status: item.status,
      occurredAt: item.created_at.toISOString(),
      supportIssueId: item.id,
      contact: item.requester_email || item.requester_phone,
      summary: item.message.slice(0, 500)
    }))
  };
}
