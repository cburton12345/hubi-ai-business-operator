import { queryPostgres } from "@/lib/db/postgres";

export type AccessRequestRow = {
  id: string;
  requestType: string;
  status: string;
  priority: string;
  name: string;
  email: string;
  phone: string;
  companyName: string;
  businessType: string;
  websiteUrl: string;
  requestedPlan: string;
  mainGoal: string;
  message: string;
  source: string;
  sourceDetail: string;
  createdAt: string;
};

export type AccessRequestStats = {
  newRequests: number;
  reviewing: number;
  invited: number;
  highPriority: number;
};

export async function getAccessRequestRows(): Promise<AccessRequestRow[]> {
  const result = await queryPostgres<{
    id: string;
    request_type: string;
    status: string;
    priority: string;
    name: string | null;
    email: string;
    phone: string | null;
    company_name: string | null;
    business_type: string | null;
    website_url: string | null;
    requested_plan: string | null;
    main_goal: string | null;
    message: string | null;
    source: string;
    source_detail: string | null;
    created_at: Date;
  }>(
    `
    select
      id,
      request_type,
      status,
      priority,
      name,
      email,
      phone,
      company_name,
      business_type,
      website_url,
      requested_plan,
      main_goal,
      message,
      source,
      source_detail,
      created_at
    from public.access_requests
    where status <> 'spam'
    order by
      case priority when 'high' then 1 when 'normal' then 2 else 3 end,
      created_at desc
    limit 100
    `
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    priority: row.priority,
    name: row.name ?? "",
    email: row.email,
    phone: row.phone ?? "",
    companyName: row.company_name ?? "",
    businessType: row.business_type ?? "",
    websiteUrl: row.website_url ?? "",
    requestedPlan: row.requested_plan ?? "not_sure",
    mainGoal: row.main_goal ?? "",
    message: row.message ?? "",
    source: row.source,
    sourceDetail: row.source_detail ?? "",
    createdAt: row.created_at.toISOString()
  }));
}

export async function getAccessRequestStats(): Promise<AccessRequestStats> {
  const result = await queryPostgres<{
    new_requests: string;
    reviewing: string;
    invited: string;
    high_priority: string;
  }>(
    `
    select
      count(*) filter (where status = 'new')::text as new_requests,
      count(*) filter (where status = 'reviewing')::text as reviewing,
      count(*) filter (where status = 'invited')::text as invited,
      count(*) filter (where priority = 'high' and status in ('new','reviewing'))::text as high_priority
    from public.access_requests
    `
  );
  const row = result?.rows[0];

  return {
    newRequests: Number(row?.new_requests ?? 0),
    reviewing: Number(row?.reviewing ?? 0),
    invited: Number(row?.invited ?? 0),
    highPriority: Number(row?.high_priority ?? 0)
  };
}
