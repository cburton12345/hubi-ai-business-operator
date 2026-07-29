import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type TalentDashboard = {
  metrics: { openRoles: number; activeApplicants: number; interviews: number; onboardingDue: number; expiringCredentials: number };
  openings: { id: string; title: string; department: string; location: string; type: string; status: string; applicants: number }[];
  applicants: { id: string; name: string; role: string; stage: string; source: string; score: number | null; summary: string; updatedAt: string }[];
  onboarding: { id: string; worker: string; title: string; status: string; due: string }[];
  credentialAlerts: { id: string; worker: string; credential: string; expires: string }[];
};

export async function getTalentDashboard(): Promise<TalentDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [metricsResult, openingsResult, applicantsResult, onboardingResult, credentialsResult] = await Promise.all([
    queryPostgres<{
      open_roles: string; active_applicants: string; interviews: string; onboarding_due: string; expiring_credentials: string;
    }>(
      `
      select
        (select count(*) from public.recruiting_job_openings where tenant_id = $1 and status = 'open')::text as open_roles,
        (select count(*) from public.recruiting_applicants where tenant_id = $1 and stage not in ('hired','rejected','withdrawn'))::text as active_applicants,
        (select count(*) from public.recruiting_interviews where tenant_id = $1 and status in ('planned','confirmed') and scheduled_start >= now())::text as interviews,
        (select count(*) from public.worker_onboarding_tasks where tenant_id = $1 and status not in ('complete','waived') and (due_at is null or due_at <= now() + interval '7 days'))::text as onboarding_due,
        (select count(*) from public.operations_worker_certifications where tenant_id = $1 and verified = true and expires_at between current_date and current_date + 45)::text as expiring_credentials
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; title: string; department: string | null; location: string | null; employment_type: string; status: string; applicants: string }>(
      `
      select o.id, o.title, o.department, o.location, o.employment_type, o.status,
        count(a.id)::text as applicants
      from public.recruiting_job_openings o
      left join public.recruiting_applicants a on a.opening_id = o.id and a.tenant_id = o.tenant_id
      where o.tenant_id = $1
      group by o.id
      order by (o.status = 'open') desc, o.updated_at desc
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string; role: string | null; stage: string; source: string | null; ai_score: number | null; ai_summary: string | null; updated_at: Date }>(
      `
      select a.id, a.name, o.title as role, a.stage, a.source, a.ai_score, a.ai_summary, a.updated_at
      from public.recruiting_applicants a
      left join public.recruiting_job_openings o on o.id = a.opening_id and o.tenant_id = a.tenant_id
      where a.tenant_id = $1
      order by case a.stage when 'offer' then 1 when 'interview' then 2 when 'screening' then 3 else 4 end, a.updated_at desc
      limit 100
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; worker_name: string | null; title: string; status: string; due_at: Date | null }>(
      `
      select t.id, coalesce(w.name, a.name) as worker_name, t.title, t.status, t.due_at
      from public.worker_onboarding_tasks t
      left join public.operations_workers w on w.id = t.worker_id and w.tenant_id = t.tenant_id
      left join public.recruiting_applicants a on a.id = t.applicant_id and a.tenant_id = t.tenant_id
      where t.tenant_id = $1 and t.status not in ('complete','waived')
      order by t.due_at nulls last, t.created_at
      limit 50
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; worker_name: string; certification_label: string; expires_at: Date }>(
      `
      select c.id, w.name as worker_name, c.certification_label, c.expires_at
      from public.operations_worker_certifications c
      join public.operations_workers w on w.id = c.worker_id and w.tenant_id = c.tenant_id
      where c.tenant_id = $1 and c.verified = true and c.expires_at between current_date and current_date + 45
      order by c.expires_at
      `,
      [tenantId]
    )
  ]);
  const m = metricsResult?.rows[0];
  const day = (value: Date | null) => value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(value) : "No due date";
  return {
    metrics: {
      openRoles: Number(m?.open_roles ?? 0),
      activeApplicants: Number(m?.active_applicants ?? 0),
      interviews: Number(m?.interviews ?? 0),
      onboardingDue: Number(m?.onboarding_due ?? 0),
      expiringCredentials: Number(m?.expiring_credentials ?? 0)
    },
    openings: (openingsResult?.rows ?? []).map((row) => ({
      id: row.id, title: row.title, department: row.department ?? "", location: row.location ?? "",
      type: row.employment_type, status: row.status, applicants: Number(row.applicants)
    })),
    applicants: (applicantsResult?.rows ?? []).map((row) => ({
      id: row.id, name: row.name, role: row.role ?? "General applicant", stage: row.stage,
      source: row.source ?? "Direct", score: row.ai_score, summary: row.ai_summary ?? "",
      updatedAt: day(row.updated_at)
    })),
    onboarding: (onboardingResult?.rows ?? []).map((row) => ({
      id: row.id, worker: row.worker_name ?? "Unassigned", title: row.title, status: row.status, due: day(row.due_at)
    })),
    credentialAlerts: (credentialsResult?.rows ?? []).map((row) => ({
      id: row.id, worker: row.worker_name, credential: row.certification_label, expires: day(row.expires_at)
    }))
  };
}
