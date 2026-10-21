import { queryPostgres } from "@/lib/db/postgres";

export type FerocityChatResponseStatus = "completed" | "needs_input" | "needs_attention" | "failed";

export async function persistFerocityOwnerRequest(input: {
  tenantId: string;
  threadId: string;
  userId?: string | null;
  clientRequestId: string;
  body: string;
  detail?: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ id: string }>(
    `with inserted as (
       insert into public.ferocity_chat_messages
         (tenant_id,thread_id,user_id,role,body,status,detail_json)
       values ($1,$2,$3,'owner',$4,'completed',$5::jsonb)
       on conflict do nothing
       returning id
     ), existing as (
       select id from public.ferocity_chat_messages
        where tenant_id=$1 and thread_id=$2 and role='owner'
          and detail_json->>'clientRequestId'=$6
        order by created_at desc limit 1
     ), touched as (
       update public.ferocity_chat_threads set updated_at=now()
        where tenant_id=$1 and id=$2 returning id
     )
     select id from inserted
     union all select id from existing
     limit 1`,
    [
      input.tenantId,
      input.threadId,
      input.userId ?? null,
      input.body.slice(0, 10_000),
      JSON.stringify({ ...(input.detail ?? {}), clientRequestId: input.clientRequestId }),
      input.clientRequestId,
    ],
  );
  return result?.rows[0]?.id ?? null;
}

export async function persistFerocityResponse(input: {
  tenantId: string;
  threadId: string;
  userId?: string | null;
  clientRequestId: string;
  body: string;
  commandRunId?: string | null;
  status: FerocityChatResponseStatus;
  detail?: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ id: string }>(
    `with inserted as (
       insert into public.ferocity_chat_messages
         (tenant_id,thread_id,user_id,role,body,command_run_id,status,detail_json)
       values ($1,$2,$3,'ferocity',$4,$5,$6,$7::jsonb)
       on conflict do nothing
       returning id
     ), existing as (
       select id from public.ferocity_chat_messages
        where tenant_id=$1 and thread_id=$2 and role='ferocity'
          and detail_json->>'clientRequestId'=$8
        order by created_at desc limit 1
     ), touched as (
       update public.ferocity_chat_threads set updated_at=now()
        where tenant_id=$1 and id=$2 returning id
     )
     select id from inserted
     union all select id from existing
     limit 1`,
    [
      input.tenantId,
      input.threadId,
      input.userId ?? null,
      input.body.slice(0, 10_000),
      input.commandRunId ?? null,
      input.status,
      JSON.stringify({ ...(input.detail ?? {}), clientRequestId: input.clientRequestId }),
      input.clientRequestId,
    ],
  );
  return result?.rows[0]?.id ?? null;
}
