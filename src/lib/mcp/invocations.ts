import { createHash, randomUUID } from "node:crypto";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";
import type { AuthenticatedExternalAiCredential } from "@/lib/mcp/credentials";
import { evaluateExternalAiUsage } from "@/lib/mcp/usage-policy";

export type ExternalToolStatus = "queued" | "running" | "completed" | "needs_review" | "failed" | "canceled" | "timed_out";

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function inputHash(input: unknown) {
  return createHash("sha256").update(canonicalize(input)).digest("hex");
}

export async function beginExternalToolInvocation(input: {
  credential: AuthenticatedExternalAiCredential;
  toolName: string;
  requestId?: string | null;
  idempotencyKey?: string | null;
  arguments: unknown;
}) {
  const id = randomUUID();
  const hash = inputHash(input.arguments);
  const result = await withPostgresTransactionResult(async (client) => {
    const usage = await client.query<{ request_count: string; returned_record_count: string; recent_request_count: string }>(
      `select count(*) filter (where created_at >= date_trunc('day',now()))::text as request_count,
         coalesce(sum(returned_record_count) filter (where created_at >= date_trunc('day',now())),0)::text as returned_record_count,
         count(*) filter (where created_at >= now()-interval '5 minutes')::text as recent_request_count
       from public.external_ai_tool_invocations where tenant_id=$1 and credential_id=$2`,
      [input.credential.tenantId, input.credential.credentialId],
    );
    const snapshot = usage.rows[0] ?? { request_count: "0", returned_record_count: "0", recent_request_count: "0" };
    const decision = evaluateExternalAiUsage({
      requestCount: Number(snapshot.request_count) || 0,
      returnedRecordCount: Number(snapshot.returned_record_count) || 0,
      recentRequestCount: Number(snapshot.recent_request_count) || 0,
    }, {
      dailyRequestLimit: input.credential.dailyRequestLimit,
      dailyRecordLimit: input.credential.dailyRecordLimit,
    });
    if (!decision.allowed) throw new Error(`${decision.code}: This connection reached its owner-configured daily usage limit.`);
    if (decision.notifyOwner) {
      await client.query(
        `insert into public.owner_command_events (
           tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
           owner_attention,ai_handled,ai_summary,recommended_action,action_href,risk_type,confidence_score,metadata_json
         ) values ($1,'external-ai','External AI',$2,'external_ai.abnormal_usage','External AI activity increased quickly',
           'A connected assistant made an unusually high number of calls within five minutes.','medium','needs_owner',
           true,true,'Ferocity stopped short of exposing secrets and kept every call scope-bound.',
           'Review the connection activity. Revoke or rotate it if the burst is unexpected.',
           '/app/integrations/external-ai','automation',95,$3::jsonb)
         on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do nothing`,
        [input.credential.tenantId,
          `credential:${input.credential.credentialId}:burst:${new Date().toISOString().slice(0, 13)}`,
          JSON.stringify({ credentialId: input.credential.credentialId, toolName: input.toolName,
            recentRequestCount: Number(snapshot.recent_request_count) || 0 })],
      );
    }
    if (input.idempotencyKey) {
      const existing = await client.query<{
        id: string; input_hash: string; status: ExternalToolStatus; output_summary_json: Record<string, unknown>;
        durable_reference_type: string | null; durable_reference_id: string | null; created_at: string;
      }>(
        `select id,input_hash,status,output_summary_json,durable_reference_type,durable_reference_id,created_at
         from public.external_ai_tool_invocations
         where tenant_id=$1 and credential_id=$2 and tool_name=$3 and idempotency_key=$4 for update`,
        [input.credential.tenantId, input.credential.credentialId, input.toolName, input.idempotencyKey],
      );
      const previous = existing.rows[0];
      if (previous) {
        if (previous.input_hash !== hash) throw new Error("The idempotency key was already used with different input.");
        if (["completed", "needs_review", "queued", "canceled"].includes(previous.status)) {
          return { ...previous, replayed: true, execute: false };
        }
        const isFreshRun = previous.status === "running" && Date.now() - new Date(previous.created_at).getTime() < 45_000;
        if (isFreshRun) return { ...previous, replayed: true, execute: false };
        await client.query(
          `update public.external_ai_tool_invocations set status='running',retry_count=retry_count+1,last_error=null,
             request_id=coalesce($2,request_id),started_at=now(),completed_at=null,updated_at=now() where id=$1`,
          [previous.id, input.requestId ?? null],
        );
        return { ...previous, status: "running" as const, output_summary_json: {}, replayed: false, execute: true };
      }
    }
    await client.query(
      `insert into public.external_ai_tool_invocations
         (id,tenant_id,credential_id,provider_key,tool_name,request_id,idempotency_key,input_hash,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'running')`,
      [id, input.credential.tenantId, input.credential.credentialId, input.credential.providerKey,
        input.toolName, input.requestId ?? null, input.idempotencyKey ?? null, hash],
    );
    return { id, status: "running" as const, output_summary_json: {}, durable_reference_type: null,
      durable_reference_id: null, replayed: false, execute: true };
  });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function finishExternalToolInvocation(input: {
  tenantId: string;
  invocationId: string;
  status: Exclude<ExternalToolStatus, "running">;
  output?: Record<string, unknown>;
  error?: string | null;
  durableReferenceType?: string | null;
  durableReferenceId?: string | null;
  returnedRecordCount?: number;
}) {
  await queryPostgres(
    `update public.external_ai_tool_invocations set status=$3,output_summary_json=$4::jsonb,last_error=$5,
       durable_reference_type=$6,durable_reference_id=$7,returned_record_count=$8,completed_at=now(),updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, input.invocationId, input.status, JSON.stringify(input.output ?? {}), input.error?.slice(0, 1_000) ?? null,
      input.durableReferenceType ?? null, input.durableReferenceId ?? null, Math.max(0, Math.trunc(input.returnedRecordCount ?? 0))],
  );
}

export async function getExternalToolInvocation(input: {
  credential: AuthenticatedExternalAiCredential;
  invocationId: string;
}) {
  const result = await queryPostgres(
    `select id as "jobId",tool_name as "toolName",status,durable_reference_type as "referenceType",
       durable_reference_id as "referenceId",output_summary_json as output,last_error as "lastError",
       retry_count as "retryCount",started_at as "startedAt",completed_at as "completedAt",updated_at as "updatedAt"
     from public.external_ai_tool_invocations
     where tenant_id=$1 and credential_id=$2 and id=$3 limit 1`,
    [input.credential.tenantId, input.credential.credentialId, input.invocationId],
  );
  return result?.rows[0] ?? null;
}
