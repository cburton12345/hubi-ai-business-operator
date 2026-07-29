import { createHash } from "node:crypto";
import { buildICalendar } from "@/lib/calendar/ical";
import { queryPostgres } from "@/lib/db/postgres";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || token.length < 32 || token.length > 200) {
    return new Response("Calendar feed not found.", { status: 404 });
  }

  const feedResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    label: string;
    tenant_name: string;
  }>(
    `
    select f.id, f.tenant_id, f.label, t.name as tenant_name
    from public.calendar_feed_tokens f
    join public.tenants t on t.id = f.tenant_id
    where f.token_hash = $1 and f.status = 'active'
    limit 1
    `,
    [tokenHash(token)]
  );
  const feed = feedResult?.rows[0];
  if (!feed) return new Response("Calendar feed not found.", { status: 404 });

  const visitsResult = await queryPostgres<{
    id: string;
    title: string;
    customer_name: string;
    address: string | null;
    assigned_workers: string | null;
    scheduled_start: string;
    scheduled_end: string | null;
    updated_at: string;
    status: string;
  }>(
    `
    select
      v.id, v.title, c.name as customer_name,
      nullif(concat_ws(', ', l.address_line1, l.address_line2, l.city, l.state, l.postal_code), '') as address,
      string_agg(distinct w.name, ', ' order by w.name) filter (where w.id is not null) as assigned_workers,
      v.scheduled_start, v.scheduled_end, v.updated_at, v.status
    from public.service_visits v
    join public.customers c on c.tenant_id = v.tenant_id and c.id = v.customer_id
    left join public.customer_locations l on l.tenant_id = v.tenant_id and l.id = v.location_id
    left join public.service_visit_assignments a
      on a.tenant_id = v.tenant_id and a.visit_id = v.id
      and a.status in ('proposed','assigned','acknowledged','dispatched')
    left join public.operations_workers w on w.tenant_id = v.tenant_id and w.id = a.worker_id
    where v.tenant_id = $1
      and v.scheduled_start is not null
      and v.scheduled_start >= now() - interval '7 days'
      and v.scheduled_start < now() + interval '180 days'
      and v.status <> 'no_show'
    group by v.id, c.name, l.address_line1, l.address_line2, l.city, l.state, l.postal_code
    order by v.scheduled_start
    `,
    [feed.tenant_id]
  );

  await queryPostgres(
    "update public.calendar_feed_tokens set last_used_at = now() where id = $1",
    [feed.id]
  );

  const calendar = buildICalendar(
    (visitsResult?.rows ?? []).map((visit) => ({
      id: visit.id,
      title: visit.title,
      customerName: visit.customer_name,
      address: visit.address,
      assignedWorkers: visit.assigned_workers,
      scheduledStart: visit.scheduled_start,
      scheduledEnd: visit.scheduled_end,
      updatedAt: visit.updated_at,
      status: visit.status
    })),
    `${feed.tenant_name} — ${feed.label}`
  );

  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ferocity-schedule.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}
