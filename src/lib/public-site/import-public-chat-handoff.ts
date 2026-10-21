import { queryPostgres } from "@/lib/db/postgres";

export async function importPublicChatHandoff(input: {
  tenantId: string;
  requestId: string;
  chatSessionId?: string | null;
}) {
  if (!input.chatSessionId) return null;

  const transcript = await queryPostgres<{ direction: string; body: string; created_at: string }>(
    `
    select m.direction, m.body, m.created_at::text
    from public.messaging_conversations c
    join public.messages m on m.tenant_id = c.tenant_id and m.conversation_id = c.id
    where c.provider_key = 'ferocity_web_chat'
      and c.metadata_json->>'sessionId' = $1
      and c.metadata_json->>'experience' = 'ferocity_sales'
      and m.status <> 'archived'
    order by m.created_at asc
    limit 24
    `,
    [input.chatSessionId]
  );
  const messages = transcript?.rows ?? [];
  if (!messages.length) return null;

  const existing = await queryPostgres<{ id: string }>(
    `
    select id
    from public.ferocity_chat_threads
    where tenant_id = $1 and audience='owner'
      and exists (
        select 1 from public.ferocity_chat_messages m
        where m.tenant_id = $1 and m.thread_id = ferocity_chat_threads.id
          and m.detail_json->>'source' = 'public_sales_handoff'
          and m.detail_json->>'originalSessionId' = $2
      )
    limit 1
    `,
    [input.tenantId, input.chatSessionId]
  );
  if (existing?.rows[0]?.id) return existing.rows[0].id;

  const thread = await queryPostgres<{ id: string }>(
    `
    insert into public.ferocity_chat_threads (tenant_id, created_by_user_id, title)
    values ($1, null, 'Your Ferocity starting plan')
    returning id
    `,
    [input.tenantId]
  );
  const threadId = thread?.rows[0]?.id;
  if (!threadId) return null;

  for (const message of messages) {
    await queryPostgres(
      `
      insert into public.ferocity_chat_messages
        (tenant_id, thread_id, user_id, role, body, status, detail_json, created_at)
      values ($1, $2, null, $3, $4, 'completed', $5::jsonb, $6::timestamptz)
      `,
      [
        input.tenantId,
        threadId,
        message.direction === "inbound" ? "owner" : "ferocity",
        message.body,
        JSON.stringify({
          source: "public_sales_handoff",
          originalSessionId: input.chatSessionId,
          accessRequestId: input.requestId,
          imported: true,
          noActionExecutedBeforeAuthentication: true,
        }),
        message.created_at,
      ]
    );
  }

  await queryPostgres(
    `update public.ferocity_chat_threads set updated_at = now() where tenant_id = $1 and id = $2`,
    [input.tenantId, threadId]
  );
  return threadId;
}
