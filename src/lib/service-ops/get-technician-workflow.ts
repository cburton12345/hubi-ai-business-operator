import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type TechnicianWorkflow = {
  jobs: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    schedule: string;
    serviceAddress: string;
    dispatcherNotes: string;
    completionNotes: string;
    nextAction: string;
    href: string;
  }[];
};

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Unscheduled";
}

export async function getTechnicianWorkflow(): Promise<TechnicianWorkflow> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    title: string;
    status: string;
    scheduled_start: Date | null;
    service_address: string | null;
    dispatcher_notes: string | null;
    completion_notes: string | null;
    ai_next_action: string | null;
    customer_name: string;
  }>(
    `
    select
      j.id,
      j.title,
      j.status,
      j.scheduled_start,
      j.service_address,
      j.dispatcher_notes,
      j.completion_notes,
      j.ai_next_action,
      c.name as customer_name
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id
    where j.tenant_id = $1
      and j.status in ('scheduled', 'in_progress')
      and (
        j.scheduled_start is null
        or j.scheduled_start < date_trunc('day', now()) + interval '2 days'
      )
    order by coalesce(j.scheduled_start, j.created_at) asc
    limit 30
    `,
    [workspaceId]
  );

  return {
    jobs: (result?.rows ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      customerName: job.customer_name,
      status: job.status,
      schedule: formatDate(job.scheduled_start),
      serviceAddress: job.service_address ?? "Address not listed",
      dispatcherNotes: job.dispatcher_notes ?? "",
      completionNotes: job.completion_notes ?? "",
      nextAction: job.ai_next_action ?? "",
      href: `/app/service/jobs/${job.id}`
    }))
  };
}
