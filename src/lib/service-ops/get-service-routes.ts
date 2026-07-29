import { queryPostgres } from "@/lib/db/postgres";
import { keylessRouteClusterKey } from "@/lib/location/keyless-service-area";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ServiceRouteDay = {
  day: string;
  jobs: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    schedule: string;
    assignedTo: string;
    serviceArea: string;
    serviceAddress: string;
    dispatcherNotes: string;
    routeCluster: string;
    directionsUrl: string | null;
    href: string;
  }[];
};

function formatDay(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(value);
}

function formatTime(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(value) : "Any time";
}

export async function getServiceRoutes(): Promise<ServiceRouteDay[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    title: string;
    status: string;
    scheduled_start: Date | null;
    scheduled_end: Date | null;
    service_area: string | null;
    service_address: string | null;
    dispatcher_notes: string | null;
    customer_name: string;
    assigned_to: string | null;
    location_city: string | null;
    location_state: string | null;
    location_postal_code: string | null;
    location_latitude: number | null;
    location_longitude: number | null;
  }>(
    `
    select
      j.id,
      j.title,
      j.status,
      j.scheduled_start,
      j.scheduled_end,
      j.service_area,
      coalesce(
        nullif(j.service_address, ''),
        nullif(concat_ws(', ', location.address_line1, location.address_line2, location.city, location.state, location.postal_code), '')
      ) as service_address,
      j.dispatcher_notes,
      c.name as customer_name,
      u.name as assigned_to,
      location.city as location_city,
      location.state as location_state,
      location.postal_code as location_postal_code,
      location.latitude as location_latitude,
      location.longitude as location_longitude
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id
    left join public.users u on u.id = j.assigned_user_id
    left join lateral (
      select l.address_line1, l.address_line2, l.city, l.state, l.postal_code, l.latitude, l.longitude
      from public.service_visits v
      left join public.customer_locations l
        on l.tenant_id = v.tenant_id and l.id = v.location_id
      where v.tenant_id = j.tenant_id and v.service_job_id = j.id
      order by v.scheduled_start nulls last, v.created_at
      limit 1
    ) location on true
    where j.tenant_id = $1
      and j.status in ('scheduled', 'in_progress')
      and j.scheduled_start >= date_trunc('day', now())
      and j.scheduled_start < date_trunc('day', now()) + interval '14 days'
    order by j.scheduled_start asc, j.created_at asc
    `,
    [workspaceId]
  );

  const groups = new Map<string, ServiceRouteDay>();
  for (const job of result?.rows ?? []) {
    const scheduleDate = job.scheduled_start ?? new Date();
    const day = formatDay(scheduleDate);
    const existing = groups.get(day) ?? { day, jobs: [] };
    existing.jobs.push({
      id: job.id,
      title: job.title,
      customerName: job.customer_name,
      status: job.status,
      schedule: job.scheduled_end ? `${formatTime(job.scheduled_start)} - ${formatTime(job.scheduled_end)}` : formatTime(job.scheduled_start),
      assignedTo: job.assigned_to ?? "Unassigned",
      serviceArea: job.service_area ?? "No service area",
      serviceAddress: job.service_address ?? "Address not listed",
      dispatcherNotes: job.dispatcher_notes ?? "",
      routeCluster: keylessRouteClusterKey({
        city: job.location_city,
        state: job.location_state,
        postalCode: job.location_postal_code,
        latitude: job.location_latitude,
        longitude: job.location_longitude
      }).replace(/^\d:/, "").replaceAll(":", " / "),
      directionsUrl: job.service_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.service_address)}`
        : null,
      href: `/app/service/jobs/${job.id}`
    });
    groups.set(day, existing);
  }

  return Array.from(groups.values());
}
