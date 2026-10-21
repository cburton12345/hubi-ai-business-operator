import { randomUUID } from "node:crypto";
import pg from "pg";
import { importPublicChatHandoff } from "../src/lib/public-site/import-public-chat-handoff";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const sessionId = randomUUID();
const requestId = randomUUID();
let conversationId: string | null = null;
let threadId: string | null = null;

async function main() {
 await client.connect();
 try {
  const target = await client.query<{ tenant_id: string; brand_id: string }>(`
    select t.id as tenant_id, b.id as brand_id
    from public.tenants t
    join public.brands b on b.tenant_id=t.id
    where lower(t.name)='internal portfolio' and lower(b.slug)='ferocity'
    limit 1
  `);
  const row = target.rows[0];
  if (!row) throw new Error("Internal Ferocity certification workspace was not found.");

  const conversation = await client.query<{ id: string }>(`
    insert into public.messaging_conversations (
      tenant_id, brand_id, channel, provider_key, external_conversation_ref,
      subject, status, last_message_at, metadata_json
    ) values ($1,$2,'website_chat','ferocity_web_chat',$3,'Handoff certification','ai_handled',now(),$4::jsonb)
    returning id
  `, [
    row.tenant_id,
    row.brand_id,
    `handoff-certification:${sessionId}`,
    JSON.stringify({ sessionId, experience: "ferocity_sales", source: "handoff_certification" }),
  ]);
  conversationId = conversation.rows[0]?.id ?? null;
  if (!conversationId) throw new Error("Certification conversation was not created.");

  await client.query(`
    insert into public.messages (
      tenant_id, conversation_id, direction, channel, provider_key, from_value, body,
      status, ai_generated, idempotency_key, received_at, metadata_json
    ) values
      ($1,$2,'inbound','website_chat','ferocity_web_chat','Certification visitor',$3,'received',false,$5,now() - interval '2 seconds','{}'::jsonb),
      ($1,$2,'outbound','website_chat','ferocity_web_chat','Ferocity AI',$4,'sent',true,$6,now() - interval '1 second',$7::jsonb)
  `, [
    row.tenant_id,
    conversationId,
    "I need Ferocity to fix slow intake and protect staff capacity.",
    "Start with one intake-to-ready workflow, then connect follow-up and capacity reporting.",
    `handoff-cert-in:${sessionId}`,
    `handoff-cert-out:${sessionId}`,
    JSON.stringify({ responseMode: "live_ai" }),
  ]);

  threadId = await importPublicChatHandoff({ tenantId: row.tenant_id, requestId, chatSessionId: sessionId });
  if (!threadId) throw new Error("Public diagnosis was not imported into Ferocity chat.");
  const repeatedThreadId = await importPublicChatHandoff({ tenantId: row.tenant_id, requestId, chatSessionId: sessionId });
  if (repeatedThreadId !== threadId) throw new Error("Handoff import was not idempotent.");

  const imported = await client.query<{
    title: string;
    role: string;
    body: string;
    source: string;
    original_session_id: string;
    no_action: boolean;
  }>(`
    select t.title, m.role, m.body,
      m.detail_json->>'source' as source,
      m.detail_json->>'originalSessionId' as original_session_id,
      coalesce((m.detail_json->>'noActionExecutedBeforeAuthentication')::boolean,false) as no_action
    from public.ferocity_chat_threads t
    join public.ferocity_chat_messages m on m.tenant_id=t.tenant_id and m.thread_id=t.id
    where t.tenant_id=$1 and t.id=$2
    order by m.created_at
  `, [row.tenant_id, threadId]);

  if (imported.rows.length !== 2) throw new Error(`Expected two imported turns; found ${imported.rows.length}.`);
  if (imported.rows[0]?.role !== "owner" || imported.rows[1]?.role !== "ferocity") {
    throw new Error(`Imported roles did not preserve the conversation: ${JSON.stringify(imported.rows.map((message) => ({ role: message.role, body: message.body })))}`);
  }
  if (imported.rows.some((message) => message.source !== "public_sales_handoff" || message.original_session_id !== sessionId || !message.no_action)) {
    throw new Error("Imported messages did not preserve safe handoff evidence.");
  }
  if (imported.rows.some((message) => message.title !== "Your Ferocity starting plan")) throw new Error("Imported thread title was incorrect.");

  console.log("Public diagnosis -> authenticated Ferocity workspace handoff certification passed.");
  console.log("Verified transcript order, roles, provenance, no pre-auth execution, and idempotent import.");
 } finally {
   if (threadId) await client.query(`delete from public.ferocity_chat_threads where id=$1`, [threadId]);
   if (conversationId) await client.query(`delete from public.messaging_conversations where id=$1`, [conversationId]);
   await client.end();
 }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
