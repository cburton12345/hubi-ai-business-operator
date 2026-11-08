import { can } from "@/lib/auth/permissions";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";

export type TimeSupervisorScope = {
  tenantId: string;
  actorUserId: string | null;
  actorWorkerId: string | null;
  mode: "workspace" | "manager" | "crew_leader" | "none";
  allowedWorkerIds: string[] | null;
};

export async function getTimeSupervisorScope(): Promise<TimeSupervisorScope> {
  const actor = await getCurrentActor();
  const actorUserId = actor.userId === "admin-token" ? null : actor.userId;
  if (can(actor,"lead:manage")) {
    return { tenantId: actor.workspace.id,actorUserId,actorWorkerId: null,mode: "workspace",allowedWorkerIds: null };
  }
  if (!actorUserId) {
    return { tenantId: actor.workspace.id,actorUserId: null,actorWorkerId: null,mode: "none",allowedWorkerIds: [] };
  }
  const workerResult = await queryPostgres<{ id: string;role_type: string }>(
    `select id,role_type from public.operations_workers
     where tenant_id=$1 and user_id=$2 and availability_status<>'inactive'
     order by updated_at desc limit 1`,
    [actor.workspace.id,actorUserId]
  );
  const worker = workerResult.rows[0];
  if (!worker) return { tenantId: actor.workspace.id,actorUserId,actorWorkerId: null,mode: "none",allowedWorkerIds: [] };
  if (["owner","office_manager","manager"].includes(worker.role_type)) {
    return { tenantId: actor.workspace.id,actorUserId,actorWorkerId: worker.id,mode: "manager",allowedWorkerIds: null };
  }
  if (worker.role_type !== "crew_leader") {
    return { tenantId: actor.workspace.id,actorUserId,actorWorkerId: worker.id,mode: "none",allowedWorkerIds: [] };
  }
  const crewResult = await queryPostgres<{ worker_id: string }>(
    `select distinct member.worker_id
     from public.operations_crews crew
     join public.operations_crew_members member
       on member.tenant_id=crew.tenant_id and member.crew_id=crew.id
     where crew.tenant_id=$1 and crew.crew_leader_worker_id=$2 and crew.status='active'
     union select $2::uuid as worker_id`,
    [actor.workspace.id,worker.id]
  );
  return {
    tenantId: actor.workspace.id,actorUserId,actorWorkerId: worker.id,mode: "crew_leader",
    allowedWorkerIds: crewResult.rows.map((row) => row.worker_id)
  };
}

export function timeScopeAllowsWorker(scope: TimeSupervisorScope, workerId: string) {
  return scope.allowedWorkerIds === null || scope.allowedWorkerIds.includes(workerId);
}
