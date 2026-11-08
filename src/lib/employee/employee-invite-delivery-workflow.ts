import type { PoolClient } from "pg";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { createPostgresPool } from "@/lib/db/postgres";
import {
  attemptEmployeeInviteDelivery,
  type EmployeeInviteDeliveryResult
} from "@/lib/employee/employee-invite-delivery";
import {
  employeeInviteEventId,
  employeeInviteLockKey,
  normalizeEmployeeInviteEmail
} from "@/lib/employee/employee-invite-identity";

type InviteClient = Pick<PoolClient, "query">;

type DeliveryLifecycle = {
  delivery_state: string | null;
  attempt_id: string | null;
};

export type EmployeeInviteWorkflowResult =
  | { ok: true; outcome: "delivered" | "overlapping_request_skipped" }
  | {
      ok: false;
      outcome: "database_unavailable" | "persistence_failed" | "delivery_failed" | "outcome_unknown";
    };

type InviteWorkflowInput = {
  tenantId: string;
  workerId: string;
  workerName: string;
  email: string;
  invitedByUserId: string | null;
};

async function readLifecycle(client: InviteClient, input: InviteWorkflowInput) {
  const result = await client.query<DeliveryLifecycle>(
    `select metadata_json->>'inviteDelivery' as delivery_state,
            metadata_json->>'deliveryAttemptId' as attempt_id
     from public.owner_command_events
     where tenant_id = $1 and platform_key = 'ferocity-workforce' and external_event_id = $2
     limit 1`,
    [input.tenantId, employeeInviteEventId(input.tenantId, input.email)]
  );
  return result.rows[0] ?? { delivery_state: null, attempt_id: null };
}

async function rollbackQuietly(client: InviteClient) {
  await client.query("rollback").catch(() => undefined);
}

export async function deliverEmployeeInviteWithClient(
  client: InviteClient,
  input: InviteWorkflowInput,
  deliver: (token: string) => Promise<EmployeeInviteDeliveryResult>,
  createToken: () => string = randomSessionToken
): Promise<EmployeeInviteWorkflowResult> {
  let initial: DeliveryLifecycle;
  try {
    initial = await readLifecycle(client, input);
  } catch {
    return { ok: false, outcome: "database_unavailable" };
  }

  const token = createToken();
  const tokenHash = hashSessionToken(token);
  const attemptId = randomSessionToken();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      employeeInviteLockKey(input.tenantId, input.email)
    ]);
    const current = await readLifecycle(client, input);
    if (current.delivery_state === "sending") {
      await rollbackQuietly(client);
      return current.attempt_id !== initial.attempt_id || initial.delivery_state !== "sending"
        ? { ok: true, outcome: "overlapping_request_skipped" }
        : { ok: false, outcome: "outcome_unknown" };
    }
    if (
      current.delivery_state === "delivered" &&
      (initial.delivery_state !== "delivered" || current.attempt_id !== initial.attempt_id)
    ) {
      await rollbackQuietly(client);
      return { ok: true, outcome: "overlapping_request_skipped" };
    }
    const eventWrite = await client.query(
        `insert into public.owner_command_events (
           tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
           severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
           action_href, risk_type, confidence_score, metadata_json
         ) values ($1,'ferocity-workforce','Ferocity Workforce',$2,'employee.invite_delivery_pending',$3,$4,
           'high','needs_owner',true,false,$5,$6,'/app/operations-workforce','approval',100,$7::jsonb)
         on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do update
         set event_type='employee.invite_delivery_pending',title=excluded.title,summary=excluded.summary,
             severity='high',status='needs_owner',owner_attention=true,ai_handled=false,
             ai_summary=excluded.ai_summary,recommended_action=excluded.recommended_action,
             action_href=excluded.action_href,
             metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json,updated_at=now()
         returning id`,
        [
          input.tenantId,
          employeeInviteEventId(input.tenantId, input.email),
          `${input.workerName}'s secure employee invite is being delivered`,
          "The invite token was saved before delivery. Ferocity has not yet confirmed the email outcome.",
          "A secure invitation delivery attempt is in progress or its final status could not be recorded.",
          "Do not start another delivery while this attempt is unresolved. Review the employee with support if this alert remains.",
          JSON.stringify({
            workerId: input.workerId,
            inviteDelivery: "sending",
            deliveryAttemptId: attemptId
          })
        ]
    );
    if (eventWrite.rowCount !== 1) throw new Error("Invite delivery state was not saved.");

    const inviteWrite = await client.query<{ invite_token_hash: string }>(
        `insert into public.workspace_invites (
           tenant_id, email, role, status, invited_by_user_id, invite_token_hash, expires_at,
           worker_id, invite_purpose, updated_at
         ) values ($1, lower($2), 'viewer', 'pending', $3, $4, now() + interval '14 days', $5, 'employee', now())
         on conflict (tenant_id, email) do update
         set role = 'viewer', status = 'pending', invited_by_user_id = excluded.invited_by_user_id,
             invite_token_hash = excluded.invite_token_hash, expires_at = excluded.expires_at,
             worker_id = excluded.worker_id, invite_purpose = 'employee', revoked_at = null, updated_at = now()
         returning invite_token_hash`,
        [
          input.tenantId,
          normalizeEmployeeInviteEmail(input.email),
          input.invitedByUserId,
          tokenHash,
          input.workerId
        ]
    );
    if (inviteWrite.rowCount !== 1 || inviteWrite.rows[0]?.invite_token_hash !== tokenHash) {
      throw new Error("Invite token persistence was not confirmed.");
    }
    await client.query("commit");
  } catch {
    await rollbackQuietly(client);
    return { ok: false, outcome: "persistence_failed" };
  }

  const delivery: EmployeeInviteDeliveryResult = await attemptEmployeeInviteDelivery(() => deliver(token));
  try {
    await client.query("begin");
    const finalized = await client.query(
        `update public.owner_command_events
         set event_type=$4,title=$5,summary=$6,severity=$7,status=$8,owner_attention=$9,ai_handled=$10,
             ai_summary=$11,recommended_action=$12,
             metadata_json=metadata_json || $13::jsonb,updated_at=now()
         where tenant_id=$1 and platform_key='ferocity-workforce' and external_event_id=$2
           and metadata_json->>'deliveryAttemptId'=$3`,
        delivery.ok
          ? [
              input.tenantId,employeeInviteEventId(input.tenantId, input.email),attemptId,"employee.invite_delivered",
              `${input.workerName}'s secure employee invite was delivered`,
              "Ferocity confirmed delivery of the latest employee invitation.","info","resolved",false,true,
              "The latest secure employee invitation was delivered.",
              "No action is needed unless the employee reports trouble signing in.",
              JSON.stringify({ inviteDelivery: "delivered" })
            ]
          : [
              input.tenantId,employeeInviteEventId(input.tenantId, input.email),attemptId,"employee.invite_delivery_failed",
              `${input.workerName}'s secure employee invite was not delivered`,
              "The invite remains valid, but Ferocity could not confirm email delivery.","high","needs_owner",true,false,
              "Workspace access was prepared, but the employee email was not delivered.",
              "Use Send secure employee invite to retry. A confirmed retry rotates the private link.",
              JSON.stringify({ inviteDelivery: "failed" })
            ]
    );
    if (finalized.rowCount !== 1) throw new Error("Invite delivery result was not recorded.");
    await client.query("commit");
  } catch {
    await rollbackQuietly(client);
    return { ok: false, outcome: "outcome_unknown" };
  }
  return delivery.ok
    ? { ok: true, outcome: "delivered" }
    : { ok: false, outcome: "delivery_failed" };
}

export async function deliverEmployeeInviteWithRecovery(
  input: InviteWorkflowInput,
  deliver: (token: string) => Promise<EmployeeInviteDeliveryResult>
): Promise<EmployeeInviteWorkflowResult> {
  const pool = createPostgresPool();
  if (!pool) return { ok: false, outcome: "database_unavailable" };
  const client = await pool.connect().catch(() => null);
  if (!client) return { ok: false, outcome: "database_unavailable" };
  try {
    return await deliverEmployeeInviteWithClient(client, input, deliver);
  } finally {
    client.release();
  }
}
