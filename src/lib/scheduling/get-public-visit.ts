import { queryPostgres } from "@/lib/db/postgres";

type PublicVisitRow = {
  token_status: string;
  expires_at: Date | null;
  visit_id: string;
  tenant_id: string;
  title: string;
  status: string;
  confirmation_status: string;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  arrival_window_start: Date | null;
  arrival_window_end: Date | null;
  customer_name: string;
  business_name: string;
  location_name: string | null;
  address: string | null;
};

export async function getPublicVisit(token: string) {
  const result = await queryPostgres<PublicVisitRow>(
    `
    select
      t.status as token_status, t.expires_at, v.id as visit_id, v.tenant_id,
      v.title, v.status, v.customer_confirmation_status as confirmation_status,
      v.scheduled_start, v.scheduled_end, v.arrival_window_start, v.arrival_window_end,
      c.name as customer_name, coalesce(b.name, 'Your service team') as business_name,
      l.name as location_name,
      nullif(concat_ws(', ', l.address_line1, l.city, l.state, l.postal_code), '') as address
    from public.service_visit_customer_tokens t
    join public.service_visits v on v.id = t.visit_id and v.tenant_id = t.tenant_id
    join public.customers c on c.id = v.customer_id and c.tenant_id = v.tenant_id
    left join public.brands b on b.id = v.brand_id and b.tenant_id = v.tenant_id
    left join public.customer_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
    where t.public_token = $1
    limit 1
    `,
    [token]
  );
  const row = result?.rows[0];
  if (!row || row.token_status !== "active" || (row.expires_at && row.expires_at.getTime() <= Date.now())) {
    return null;
  }

  await queryPostgres(
    "update public.service_visit_customer_tokens set last_used_at = now(), updated_at = now() where public_token = $1",
    [token]
  );

  return {
    token,
    visitId: row.visit_id,
    tenantId: row.tenant_id,
    title: row.title,
    visitStatus: row.status,
    confirmationStatus: row.confirmation_status,
    scheduledStart: row.scheduled_start?.toISOString() ?? null,
    scheduledEnd: row.scheduled_end?.toISOString() ?? null,
    arrivalWindowStart: row.arrival_window_start?.toISOString() ?? null,
    arrivalWindowEnd: row.arrival_window_end?.toISOString() ?? null,
    customerName: row.customer_name,
    businessName: row.business_name,
    locationName: row.location_name,
    address: row.address
  };
}
