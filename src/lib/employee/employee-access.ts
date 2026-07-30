import { can } from "@/lib/auth/permissions";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";

export type EmployeeAccessContext = {
  tenantId: string;
  userId: string | null;
  workerId: string | null;
  workerName: string | null;
  canManageAll: boolean;
};

export async function getEmployeeAccessContext(): Promise<EmployeeAccessContext> {
  const actor = await getCurrentActor();
  const userId = actor.userId === "admin-token" ? null : actor.userId;
  const canManageAll = can(actor, "lead:manage");
  if (!userId) {
    return {
      tenantId: actor.workspace.id,
      userId: null,
      workerId: null,
      workerName: null,
      canManageAll
    };
  }

  const workerResult = await queryPostgres<{
    id: string;
    name: string;
    user_id: string | null;
  }>(
    `
    select id, name, user_id
    from public.operations_workers
    where tenant_id = $1
      and availability_status <> 'inactive'
      and (
        user_id = $2
        or (user_id is null and email is not null and lower(email) = lower($3))
      )
    order by case when user_id = $2 then 0 else 1 end, updated_at desc
    limit 1
    `,
    [actor.workspace.id, userId, actor.email]
  );
  const worker = workerResult?.rows[0];

  if (worker && !worker.user_id) {
    await queryPostgres(
      `
      update public.operations_workers
      set user_id = $3, updated_at = now()
      where tenant_id = $1
        and id = $2
        and user_id is null
        and not exists (
          select 1
          from public.operations_workers
          where tenant_id = $1 and user_id = $3 and id <> $2
        )
      `,
      [actor.workspace.id, worker.id, userId]
    );
  }

  return {
    tenantId: actor.workspace.id,
    userId,
    workerId: worker?.id ?? null,
    workerName: worker?.name ?? null,
    canManageAll
  };
}

export async function canAccessEmployeeAssignment(context: EmployeeAccessContext, assignmentId: string) {
  if (context.canManageAll) {
    const result = await queryPostgres<{ allowed: boolean }>(
      `select exists(select 1 from public.operations_assignments where tenant_id = $1 and id = $2) as allowed`,
      [context.tenantId, assignmentId]
    );
    return result?.rows[0]?.allowed === true;
  }
  if (!context.workerId) return false;

  const result = await queryPostgres<{ allowed: boolean }>(
    `
    select exists(
      select 1
      from public.operations_assignments a
      where a.tenant_id = $1
        and a.id = $2
        and (
          a.worker_id = $3
          or exists (
            select 1
            from public.operations_crew_members cm
            where cm.tenant_id = a.tenant_id
              and cm.crew_id = a.crew_id
              and cm.worker_id = $3
          )
          or (
            a.service_visit_id is not null
            and exists (
              select 1
              from public.service_visit_assignments va
              where va.tenant_id = a.tenant_id
                and va.visit_id = a.service_visit_id
                and va.worker_id = $3
            )
          )
        )
    ) as allowed
    `,
    [context.tenantId, assignmentId, context.workerId]
  );
  return result?.rows[0]?.allowed === true;
}

export async function canAccessEmployeeVisit(context: EmployeeAccessContext, visitId: string) {
  if (context.canManageAll) {
    const result = await queryPostgres<{ allowed: boolean }>(
      `select exists(select 1 from public.service_visits where tenant_id = $1 and id = $2) as allowed`,
      [context.tenantId, visitId]
    );
    return result?.rows[0]?.allowed === true;
  }
  if (!context.workerId) return false;

  const result = await queryPostgres<{ allowed: boolean }>(
    `
    select exists(
      select 1
      from public.service_visits v
      where v.tenant_id = $1
        and v.id = $2
        and (
          exists (
            select 1
            from public.service_visit_assignments va
            where va.tenant_id = v.tenant_id
              and va.visit_id = v.id
              and va.worker_id = $3
          )
          or exists (
            select 1
            from public.operations_assignments a
            where a.tenant_id = v.tenant_id
              and a.service_visit_id = v.id
              and (
                a.worker_id = $3
                or exists (
                  select 1
                  from public.operations_crew_members cm
                  where cm.tenant_id = a.tenant_id
                    and cm.crew_id = a.crew_id
                    and cm.worker_id = $3
                )
              )
          )
        )
    ) as allowed
    `,
    [context.tenantId, visitId, context.workerId]
  );
  return result?.rows[0]?.allowed === true;
}

export async function requireEmployeeVisitAccess(visitId: string) {
  const context = await getEmployeeAccessContext();
  if (!(await canAccessEmployeeVisit(context, visitId))) {
    throw new Error("This visit is not assigned to the signed-in employee.");
  }
  return context;
}
