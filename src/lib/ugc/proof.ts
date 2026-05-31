import crypto from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ProofSubmissionRow = {
  id: string;
  title: string;
  status: string;
  customerName: string;
  serviceType: string;
  location: string;
  rating: number | null;
  storyText: string;
  resultSummary: string;
  permissionMarketing: boolean;
  permissionUseName: boolean;
  permissionUseLocation: boolean;
  assetCount: number;
  outputCount: number;
  createdAt: string;
};

export type ProofAssetRow = {
  id: string;
  submissionId: string;
  assetType: string;
  beforeAfter: string;
  storageBucket: string;
  storagePath: string;
  externalUrl: string;
  previewUrl: string;
  originalFilename: string;
  mimeType: string;
  caption: string;
  status: string;
};

export type ProofRequestCandidate = {
  customerId: string;
  customerName: string;
  jobId: string | null;
  jobTitle: string;
  status: string;
  serviceArea: string;
};

export type ProofDashboard = {
  metrics: {
    needsReview: number;
    approved: number;
    assets: number;
    outputs: number;
  };
  submissions: ProofSubmissionRow[];
  assets: ProofAssetRow[];
  candidates: ProofRequestCandidate[];
  requests: {
    id: string;
    publicToken: string;
    requestType: string;
    status: string;
    customerName: string;
    jobTitle: string;
    createdAt: string;
  }[];
};

export type ProofPublicContext = {
  mode: "portal" | "request";
  token: string;
  organizationName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  tenantId: string;
  brandId: string | null;
  customerId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  location: string;
};

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function makePublicToken(prefix = "proof") {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

export async function getProofDashboard(): Promise<ProofDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const supabase = createSupabaseAdminClient();
  const [metricsResult, submissionsResult, assetsResult, candidatesResult, requestsResult] = await Promise.all([
    queryPostgres<{ needs_review: string; approved: string; assets: string; outputs: string }>(
      `
      select
        (select count(*) from public.ugc_submissions where tenant_id = $1 and status = 'needs_review')::text as needs_review,
        (select count(*) from public.ugc_submissions where tenant_id = $1 and status = 'approved')::text as approved,
        (select count(*) from public.ugc_assets where tenant_id = $1)::text as assets,
        (select count(*) from public.ugc_content_outputs where tenant_id = $1)::text as outputs
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string | null;
      status: string;
      customer_name: string | null;
      service_type: string | null;
      city: string | null;
      state: string | null;
      rating: number | null;
      story_text: string | null;
      result_summary: string | null;
      permission_marketing: boolean;
      permission_use_name: boolean;
      permission_use_location: boolean;
      asset_count: string;
      output_count: string;
      created_at: Date;
    }>(
      `
      select
        s.id,
        s.title,
        s.status,
        coalesce(s.customer_name, c.name) as customer_name,
        s.service_type,
        s.city,
        s.state,
        s.rating,
        s.story_text,
        s.result_summary,
        s.permission_marketing,
        s.permission_use_name,
        s.permission_use_location,
        (select count(*) from public.ugc_assets a where a.submission_id = s.id)::text as asset_count,
        (select count(*) from public.ugc_content_outputs o where o.submission_id = s.id)::text as output_count,
        s.created_at
      from public.ugc_submissions s
      left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
      where s.tenant_id = $1
      order by s.created_at desc
      limit 50
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      submission_id: string;
      asset_type: string;
      before_after: string;
      storage_bucket: string | null;
      storage_path: string | null;
      external_url: string | null;
      original_filename: string | null;
      mime_type: string | null;
      caption: string | null;
      status: string;
    }>(
      `
      select id, submission_id, asset_type, before_after, storage_bucket, storage_path, external_url, original_filename, mime_type, caption, status
      from public.ugc_assets
      where tenant_id = $1
      order by created_at desc
      limit 80
      `,
      [workspaceId]
    ),
    queryPostgres<{
      customer_id: string;
      customer_name: string;
      job_id: string | null;
      job_title: string | null;
      status: string;
      service_area: string | null;
    }>(
      `
      select
        c.id as customer_id,
        c.name as customer_name,
        j.id as job_id,
        j.title as job_title,
        coalesce(j.status, c.status) as status,
        coalesce(j.service_area, c.city, '') as service_area
      from public.customers c
      left join public.service_jobs j on j.customer_id = c.id and j.tenant_id = c.tenant_id
      where c.tenant_id = $1
      order by case when j.status = 'completed' then 0 else 1 end, coalesce(j.updated_at, c.updated_at) desc
      limit 40
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      public_token: string;
      request_type: string;
      status: string;
      customer_name: string | null;
      job_title: string | null;
      created_at: Date;
    }>(
      `
      select
        r.id,
        r.public_token,
        r.request_type,
        r.status,
        c.name as customer_name,
        j.title as job_title,
        r.created_at
      from public.ugc_capture_requests r
      left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
      left join public.service_jobs j on j.id = r.job_id and j.tenant_id = r.tenant_id
      where r.tenant_id = $1
      order by r.created_at desc
      limit 20
      `,
      [workspaceId]
    )
  ]);

  const metrics = metricsResult?.rows[0];
  const assets = await Promise.all(
    (assetsResult?.rows ?? []).map(async (row) => {
      let previewUrl = "";
      if (supabase && row.storage_bucket && row.storage_path) {
        const signed = await supabase.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 60 * 30);
        previewUrl = signed.data?.signedUrl ?? "";
      }

      return {
        id: row.id,
        submissionId: row.submission_id,
        assetType: row.asset_type,
        beforeAfter: row.before_after,
        storageBucket: row.storage_bucket || "",
        storagePath: row.storage_path || "",
        externalUrl: row.external_url || "",
        previewUrl,
        originalFilename: row.original_filename || "",
        mimeType: row.mime_type || "",
        caption: row.caption || "",
        status: row.status
      } satisfies ProofAssetRow;
    })
  );

  return {
    metrics: {
      needsReview: Number(metrics?.needs_review ?? 0),
      approved: Number(metrics?.approved ?? 0),
      assets: Number(metrics?.assets ?? 0),
      outputs: Number(metrics?.outputs ?? 0)
    },
    submissions: (submissionsResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title || "Customer proof submission",
      status: row.status,
      customerName: row.customer_name || "Customer",
      serviceType: row.service_type || "Service",
      location: [row.city, row.state].filter(Boolean).join(", ") || "Location not set",
      rating: row.rating,
      storyText: row.story_text || "",
      resultSummary: row.result_summary || "",
      permissionMarketing: row.permission_marketing,
      permissionUseName: row.permission_use_name,
      permissionUseLocation: row.permission_use_location,
      assetCount: Number(row.asset_count ?? 0),
      outputCount: Number(row.output_count ?? 0),
      createdAt: row.created_at.toISOString()
    })),
    assets,
    candidates: (candidatesResult?.rows ?? []).map((row) => ({
      customerId: row.customer_id,
      customerName: row.customer_name,
      jobId: row.job_id,
      jobTitle: row.job_title || "General customer proof",
      status: row.status,
      serviceArea: row.service_area || "No service area"
    })),
    requests: (requestsResult?.rows ?? []).map((row) => ({
      id: row.id,
      publicToken: row.public_token,
      requestType: row.request_type,
      status: row.status,
      customerName: row.customer_name || "Customer",
      jobTitle: row.job_title || "General proof request",
      createdAt: row.created_at.toISOString()
    }))
  };
}

export async function getPortalProofContext(publicToken: string): Promise<ProofPublicContext | null> {
  const result = await queryPostgres<{
    tenant_id: string;
    brand_id: string | null;
    customer_id: string;
    customer_name: string;
    organization_name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    job_id: string | null;
    job_title: string | null;
  }>(
    `
    select
      c.tenant_id,
      c.brand_id,
      c.id as customer_id,
      c.name as customer_name,
      t.name as organization_name,
      c.email,
      c.phone,
      c.city,
      c.state,
      (
        select j.id from public.service_jobs j
        where j.tenant_id = c.tenant_id and j.customer_id = c.id and j.status in ('completed', 'in_progress', 'scheduled')
        order by case when j.status = 'completed' then 0 else 1 end, j.updated_at desc
        limit 1
      ) as job_id,
      (
        select j.title from public.service_jobs j
        where j.tenant_id = c.tenant_id and j.customer_id = c.id and j.status in ('completed', 'in_progress', 'scheduled')
        order by case when j.status = 'completed' then 0 else 1 end, j.updated_at desc
        limit 1
      ) as job_title
    from public.customer_portal_access a
    join public.customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
    join public.tenants t on t.id = a.tenant_id
    where a.public_token = $1
      and a.enabled = true
      and (a.expires_at is null or a.expires_at > now())
    limit 1
    `,
    [publicToken]
  );

  const row = result?.rows[0];
  if (!row) return null;

  return {
    mode: "portal",
    token: publicToken,
    organizationName: row.organization_name,
    customerName: row.customer_name,
    customerEmail: row.email || "",
    customerPhone: row.phone || "",
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    customerId: row.customer_id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    location: [row.city, row.state].filter(Boolean).join(", ")
  };
}

export async function getProofRequestContext(publicToken: string): Promise<ProofPublicContext | null> {
  const result = await queryPostgres<{
    tenant_id: string;
    brand_id: string | null;
    customer_id: string | null;
    job_id: string | null;
    customer_name: string | null;
    organization_name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    job_title: string | null;
  }>(
    `
    select
      r.tenant_id,
      r.brand_id,
      r.customer_id,
      r.job_id,
      c.name as customer_name,
      t.name as organization_name,
      c.email,
      c.phone,
      c.city,
      c.state,
      j.title as job_title
    from public.ugc_capture_requests r
    join public.tenants t on t.id = r.tenant_id
    left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
    left join public.service_jobs j on j.id = r.job_id and j.tenant_id = r.tenant_id
    where r.public_token = $1
      and r.status in ('ready', 'sent_manually')
      and (r.expires_at is null or r.expires_at > now())
    limit 1
    `,
    [publicToken]
  );

  const row = result?.rows[0];
  if (!row) return null;

  return {
    mode: "request",
    token: publicToken,
    organizationName: row.organization_name,
    customerName: row.customer_name || "",
    customerEmail: row.email || "",
    customerPhone: row.phone || "",
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    customerId: row.customer_id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    location: [row.city, row.state].filter(Boolean).join(", ")
  };
}

export function proofTitle(input: { serviceType: string; city: string; state: string; customerName: string }) {
  const service = str(input.serviceType).trim() || "Completed service";
  const place = [str(input.city).trim(), str(input.state).trim()].filter(Boolean).join(", ");
  return place ? `${service} in ${place}` : `${service} proof from ${str(input.customerName).trim() || "customer"}`;
}
