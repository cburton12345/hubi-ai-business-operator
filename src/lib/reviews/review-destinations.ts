import { queryPostgres } from "@/lib/db/postgres";

export const reviewDestinationProviders = [
  "google_business_profile",
  "facebook",
  "yelp",
  "bbb",
  "industry_directory",
  "custom"
] as const;

export type ReviewDestinationProvider = (typeof reviewDestinationProviders)[number];

export type ReviewDestination = {
  id: string;
  provider: ReviewDestinationProvider;
  displayName: string;
  reviewUrl: string;
  priority: number;
};

export type ReviewRequestContext = {
  id: string;
  tenantId: string;
  brandId: string | null;
  organizationName: string;
  customerName: string;
  jobTitle: string | null;
  ratingReceived: number | null;
  feedbackReceived: boolean;
  destinations: ReviewDestination[];
};

export type ReviewDestinationAdminData = {
  brands: Array<{ id: string; name: string }>;
  destinations: Array<ReviewDestination & { brandId: string | null; brandName: string | null; status: string }>;
  recentRequests: Array<{
    id: string;
    publicToken: string;
    customerName: string;
    brandName: string | null;
    channel: string;
    status: string;
    scheduledFor: Date | null;
  }>;
};

export function normalizeReviewUrl(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function destinationKey(provider: ReviewDestinationProvider, displayName: string) {
  const label = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "reviews";
  return `${provider}:${label}`;
}

export function reviewRequestPublicUrl(token: string, appUrl = process.env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live") {
  return new URL(`/review/${token}`, appUrl).toString();
}

export function appendReviewLink(message: string | null | undefined, publicUrl: string) {
  const base = message?.trim() || "Thanks again for choosing us. We would appreciate your honest feedback.";
  if (base.includes(publicUrl)) return base;
  return `${base}\n\nShare your honest feedback: ${publicUrl}`;
}

export async function getReviewDestinations(tenantId: string, brandId?: string | null) {
  const result = await queryPostgres<{
    id: string;
    destination_key: string;
    provider: ReviewDestinationProvider;
    display_name: string;
    review_url: string;
    priority: number;
  }>(
    `
    select id, destination_key, provider, display_name, review_url, priority
    from public.review_request_destinations
    where tenant_id = $1
      and status = 'active'
      and (brand_id = $2 or brand_id is null)
    order by case when brand_id = $2 then 0 else 1 end, priority asc, created_at asc
    `,
    [tenantId, brandId ?? null]
  );

  const seen = new Set<string>();
  return (result?.rows ?? []).flatMap((row) => {
    const normalized = normalizeReviewUrl(row.review_url);
    if (!normalized || seen.has(row.destination_key)) return [];
    seen.add(row.destination_key);
    return [{ id: row.id, provider: row.provider, displayName: row.display_name, reviewUrl: normalized, priority: row.priority }];
  });
}

export async function getReviewDestinationAdminData(tenantId: string): Promise<ReviewDestinationAdminData> {
  const [brandsResult, destinationsResult, requestsResult] = await Promise.all([
    queryPostgres<{ id: string; name: string }>(
      "select id, name from public.brands where tenant_id = $1 and status = 'active' order by name",
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      brand_id: string | null;
      brand_name: string | null;
      provider: ReviewDestinationProvider;
      display_name: string;
      review_url: string;
      priority: number;
      status: string;
    }>(
      `
      select d.id, d.brand_id, b.name as brand_name, d.provider, d.display_name,
        d.review_url, d.priority, d.status
      from public.review_request_destinations d
      left join public.brands b on b.id = d.brand_id and b.tenant_id = d.tenant_id
      where d.tenant_id = $1 and d.status <> 'archived'
      order by coalesce(b.name, ''), d.priority, d.created_at
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      public_token: string;
      customer_name: string | null;
      brand_name: string | null;
      channel: string;
      status: string;
      scheduled_for: Date | null;
    }>(
      `
      select r.id, r.public_token::text, c.name as customer_name, b.name as brand_name,
        r.channel, r.status, r.scheduled_for
      from public.review_request_workflows r
      left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
      left join public.brands b on b.id = r.brand_id and b.tenant_id = r.tenant_id
      where r.tenant_id = $1
      order by r.created_at desc
      limit 12
      `,
      [tenantId]
    )
  ]);

  return {
    brands: brandsResult?.rows ?? [],
    destinations: (destinationsResult?.rows ?? []).flatMap((row) => {
      const reviewUrl = normalizeReviewUrl(row.review_url);
      return reviewUrl
        ? [{
            id: row.id,
            brandId: row.brand_id,
            brandName: row.brand_name,
            provider: row.provider,
            displayName: row.display_name,
            reviewUrl,
            priority: row.priority,
            status: row.status
          }]
        : [];
    }),
    recentRequests: (requestsResult?.rows ?? []).map((row) => ({
      id: row.id,
      publicToken: row.public_token,
      customerName: row.customer_name ?? "Customer",
      brandName: row.brand_name,
      channel: row.channel,
      status: row.status,
      scheduledFor: row.scheduled_for
    }))
  };
}

export async function getReviewRequestContext(token: string): Promise<ReviewRequestContext | null> {
  const result = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string | null;
    organization_name: string;
    customer_name: string | null;
    job_title: string | null;
    rating_received: number | null;
    feedback_received_at: Date | null;
  }>(
    `
    select r.id, r.tenant_id, r.brand_id,
      coalesce(b.name, t.name, 'The business') as organization_name,
      c.name as customer_name,
      j.title as job_title,
      r.rating_received,
      r.feedback_received_at
    from public.review_request_workflows r
    join public.tenants t on t.id = r.tenant_id
    left join public.brands b on b.id = r.brand_id and b.tenant_id = r.tenant_id
    left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
    left join public.service_jobs j on j.id = r.job_id and j.tenant_id = r.tenant_id
    where r.public_token::text = $1
      and r.status not in ('suppressed', 'canceled')
    limit 1
    `,
    [token]
  );
  const row = result?.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    organizationName: row.organization_name,
    customerName: row.customer_name ?? "",
    jobTitle: row.job_title,
    ratingReceived: row.rating_received,
    feedbackReceived: Boolean(row.feedback_received_at),
    destinations: await getReviewDestinations(row.tenant_id, row.brand_id)
  };
}
