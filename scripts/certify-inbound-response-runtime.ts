import { randomUUID } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { recordInboundResponse } from "@/lib/messaging/record-inbound-response";

async function main() {
  const workspace = await queryPostgres<{ tenant_id: string; brand_id: string }>(
    `select tenant.id as tenant_id,brand.id as brand_id
       from public.tenants tenant
       join public.brands brand on brand.tenant_id=tenant.id
      where tenant.slug='ferocity-qa-demo'
      order by brand.created_at limit 1`,
  );
  const target = workspace?.rows[0];
  if (!target) throw new Error("Ferocity QA Demo workspace/brand was not found.");

  const marker = randomUUID();
  const externalConversationRef = `runtime-certification:${marker}`;
  const providerMessageId = `runtime-provider-event:${marker}`;
  const from = `runtime-certification-${marker}@example.invalid`;
  let conversationId: string | null = null;
  try {
    conversationId = await recordInboundResponse({
      tenantId: target.tenant_id,
      brandId: target.brand_id,
      channel: "email",
      providerKey: "runtime_certification",
      providerMessageId,
      externalConversationRef,
      from,
      subject: "Temporary inbound-response certification",
      body: "Temporary certification input. No reply or external action is authorized.",
    });
    if (!conversationId) throw new Error("Canonical inbound conversation was not created.");

    const evidence = await queryPostgres<{
      message_count: string;
      stop_count: string;
      source_links: string;
    }>(
      `select
         (select count(*)::text from public.messages
           where tenant_id=$1 and conversation_id=$2 and provider_message_ref=$3) as message_count,
         (select count(*)::text from public.customer_response_stops
           where tenant_id=$1 and conversation_id=$2 and lower(contact_value)=lower($4) and active=true) as stop_count,
         (select count(source_message_id)::text from public.messages
           where tenant_id=$1 and conversation_id=$2 and provider_message_ref=$3) as source_links`,
      [target.tenant_id, conversationId, providerMessageId, from],
    );
    const row = evidence?.rows[0];
    if (row?.message_count !== "1") throw new Error("The canonical inbound message was not persisted exactly once.");
    if (row.stop_count !== "1") throw new Error("Stop-on-response was not persisted.");
    if (row.source_links !== "0") throw new Error("A provider event was incorrectly stored as a communication-message foreign key.");

    console.log(JSON.stringify({
      ok: true,
      canonicalMessage: "persisted_once",
      stopOnResponse: "persisted",
      sourceForeignKey: "not_fabricated",
    }));
  } finally {
    await queryPostgres(
      `delete from public.customer_response_stops where tenant_id=$1 and lower(contact_value)=lower($2)`,
      [target.tenant_id, from],
    );
    await queryPostgres(
      `delete from public.messaging_conversations where tenant_id=$1 and external_conversation_ref=$2`,
      [target.tenant_id, externalConversationRef],
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Inbound-response runtime certification failed.");
  process.exitCode = 1;
});
