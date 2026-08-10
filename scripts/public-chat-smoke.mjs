import { randomUUID } from "node:crypto";
import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

const baseUrl = (process.env.FEROCITY_SMOKE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const sessionId = randomUUID();
const email = `ferocity-chat-smoke-${Date.now().toString(36)}@ferocity.live`;
let tenantId;
let conversationId;
let leadId;

try {
  const form = await client.query(`
    select f.public_key, f.tenant_id
    from public.forms f
    join public.tenants t on t.id=f.tenant_id
    join public.brands b on b.id=f.brand_id and b.tenant_id=f.tenant_id
    where t.slug='beta-roofing-co' and f.active=true and b.status='active'
    order by f.created_at asc limit 1
  `);
  if (!form.rows[0]) throw new Error("The beta workspace has no active public form.");
  tenantId = form.rows[0].tenant_id;

  const response = await fetch(`${baseUrl}/api/public/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      formPublicKey: form.rows[0].public_key,
      sessionId,
      message: "Your crew damaged my roof and I am calling my lawyer. I need the owner now.",
      name: "Workflow Smoke",
      email,
      consentToContact: true,
      website: ""
    })
  });
  const body = await response.json();
  if (response.status !== 200) throw new Error(`Public chat returned ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  if (body.needsHuman !== true || body.leadCaptured !== true || typeof body.reply !== "string" || !body.reply.trim()) {
    throw new Error(`Public chat did not complete the guarded handoff: ${JSON.stringify(body).slice(0, 300)}`);
  }

  const conversation = await client.query(`
    select c.id, c.lead_id, c.status,
      (select count(*)::int from public.messages m where m.conversation_id=c.id) as message_count,
      exists(select 1 from public.owner_command_events e where e.tenant_id=c.tenant_id and e.external_event_id='website-chat:' || c.id::text and e.owner_attention=true) as owner_event
    from public.messaging_conversations c
    where c.tenant_id=$1 and c.provider_key='ferocity_web_chat' and c.external_conversation_ref=$2
    limit 1
  `, [tenantId, `${form.rows[0].public_key}:${sessionId}`]);
  const row = conversation.rows[0];
  if (!row || row.status !== "human_handoff" || Number(row.message_count) < 2 || row.owner_event !== true) {
    throw new Error(`Public chat records were incomplete: ${JSON.stringify(row ?? {})}`);
  }
  conversationId = row.id;
  leadId = row.lead_id;
  console.log("Public chat smoke passed: lead, conversation, two-way messages, guarded handoff, and owner event verified.");
} finally {
  if (tenantId) {
    await client.query("begin");
    try {
      if (!conversationId) {
        const found = await client.query(`select id, lead_id from public.messaging_conversations where tenant_id=$1 and provider_key='ferocity_web_chat' and external_conversation_ref like '%' || $2 limit 1`, [tenantId, sessionId]);
        conversationId = found.rows[0]?.id;
        leadId = found.rows[0]?.lead_id;
      }
      if (conversationId) await client.query(`delete from public.owner_command_events where tenant_id=$1 and external_event_id=$2`, [tenantId, `website-chat:${conversationId}`]);
      if (leadId) await client.query(`delete from public.owner_command_events where tenant_id=$1 and metadata_json->>'leadId'=$2`, [tenantId, leadId]);
      if (conversationId) await client.query(`delete from public.messaging_conversations where tenant_id=$1 and id=$2`, [tenantId, conversationId]);
      if (leadId) await client.query(`delete from public.leads where tenant_id=$1 and id=$2 and lower(email)=lower($3)`, [tenantId, leadId, email]);
      await client.query("commit");
      console.log("Cleanup: public chat smoke records removed.");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  await client.end();
}
