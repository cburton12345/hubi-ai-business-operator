import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { queryPostgres } from "@/lib/db/postgres";
import { recordInboundResponse } from "@/lib/messaging/record-inbound-response";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { classifySmsKeyword, normalizeSmsKeyword } from "@/lib/messaging/sms-policy";
import { prepareInboundReply } from "@/lib/messaging/prepare-inbound-reply";
import { postH4rCallback } from "@/lib/integrations/h4r/callback";

const schema = z.object({
  eventId: z.string().min(8).max(160), sender: z.string().min(7).max(32), recipient: z.string().max(32).nullable().optional(),
  body: z.string().max(5000), receivedAt: z.string().datetime(), subscriptionId: z.number().int().nullable().optional()
});

export async function POST(request: Request) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid inbound message." }, { status: 400 });
  const event = await queryPostgres<{ id: string }>(
    `insert into public.ferocity_connect_events (tenant_id,device_id,event_type,device_event_id,safe_detail,metadata_json)
     values ($1,$2,'inbound',$3,'Inbound SMS received',$4::jsonb)
     on conflict (device_id,device_event_id) do nothing returning id`,
    [auth.identity.tenantId, auth.identity.deviceId, parsed.data.eventId,
      JSON.stringify({ subscriptionId: parsed.data.subscriptionId ?? null, receivedAt: parsed.data.receivedAt })]
  );
  if (!event?.rows[0]) return NextResponse.json({ ok: true, duplicate: true });

  const sender = parsed.data.sender.trim().toLowerCase();
  const h4rContext = await queryPostgres<{
    metadata_json: Record<string, unknown> | null;
    id: string;
  }>(
    `select id,metadata_json
     from public.ferocity_connect_jobs
     where tenant_id=$1
       and lower(recipient)=lower($2)
       and metadata_json->>'source'='h4r'
     order by created_at desc
     limit 1`,
    [auth.identity.tenantId, sender]
  );
  const h4rMetadata = h4rContext?.rows[0]?.metadata_json ?? null;
  const keyword = normalizeSmsKeyword(parsed.data.body);
  const complianceKeyword = classifySmsKeyword(parsed.data.body);
  if (complianceKeyword === "stop") {
    await queryPostgres(
      `insert into public.messaging_opt_outs (tenant_id,contact_channel,contact_value,opt_out_keyword,source_provider_key,active,metadata_json)
       values ($1,'sms',$2,$3,'ferocity_connect',true,'{"source":"ferocity_connect_device"}'::jsonb)
       on conflict (tenant_id,contact_channel,contact_value) do update set opt_out_keyword=excluded.opt_out_keyword,
       source_provider_key=excluded.source_provider_key,active=true,updated_at=now()`,
      [auth.identity.tenantId, sender, keyword]
    );
    await Promise.all([
      queryPostgres(
        `update public.messaging_consents set status='revoked',revoked_at=now(),updated_at=now()
         where tenant_id=$1 and contact_channel in ('sms','mms') and lower(contact_value)=$2`,
        [auth.identity.tenantId, sender]
      ),
      queryPostgres(
        `update public.contact_consent_records set status='revoked',updated_at=now(),
           metadata_json=metadata_json || '{"revokedByInboundSms":true}'::jsonb
         where tenant_id=$1 and channel='sms' and lower(contact_value)=$2`,
        [auth.identity.tenantId, sender]
      )
    ]);
  }
  const conversationId = await recordInboundResponse({
    tenantId: auth.identity.tenantId, channel: "sms", providerKey: "ferocity_connect",
    providerMessageId: parsed.data.eventId,
    sourceMessageId: parsed.data.eventId,
    externalConversationRef: `ferocity-connect:${auth.identity.deviceId}:${sender}`,
    from: sender, to: parsed.data.recipient ?? null, body: parsed.data.body, subject: "SMS conversation"
  });
  await queryPostgres(
    `insert into public.messaging_usage (tenant_id,provider_key,channel,direction,unit_type,unit_count,provider_cost_cents,customer_charge_cents,billing_status,metadata_json)
     values ($1,'ferocity_connect','sms','inbound','message',1,0,0,'included',$2::jsonb)`,
    [auth.identity.tenantId, JSON.stringify({ deviceId: auth.identity.deviceId, eventId: parsed.data.eventId })]
  );
  let complianceReplyQueued = false;
  if (complianceKeyword) {
    const business = await queryPostgres<{ name: string }>(`select name from public.tenants where id=$1 limit 1`, [auth.identity.tenantId]);
    const businessName = business?.rows[0]?.name?.trim() || "This business";
    const body = complianceKeyword === "stop"
      ? `${businessName}: You are unsubscribed from automated texts. Reply HELP for help.`
      : `${businessName}: Reply STOP to opt out. For help, reply with your question or contact the business directly.`;
    const reply = await sendMessage({
      tenantId: auth.identity.tenantId,
      channel: "sms",
      providerKey: "ferocity_connect",
      to: sender,
      body,
      conversationId: conversationId ?? undefined,
      idempotencyKey: `ferocity-connect-compliance:${parsed.data.eventId}:${complianceKeyword}`,
      authorization: { source: "inbound_sms_compliance", policyAllowsAuto: true },
      metadata: {
        messagePurpose: "compliance",
        inboundComplianceReply: true,
        inboundEventId: parsed.data.eventId,
        complianceKeyword
      }
    });
    complianceReplyQueued = reply.ok;
  }
  let replyDraft = null;
  if (!complianceKeyword && conversationId) {
    try {
      replyDraft = await prepareInboundReply({
        tenantId: auth.identity.tenantId, conversationId, inboundMessageId: parsed.data.eventId,
        channel: "sms", providerKey: "ferocity_connect", from: sender, body: parsed.data.body
      });
    } catch (error) {
      await queryPostgres(`
        insert into public.operator_alerts
          (tenant_id,alert_key,category,severity,status,title,summary,action_href,metadata_json)
        values ($1,$2,'automation','medium','active','SMS reply draft needs attention',$3,'/app/messaging',$4::jsonb)
        on conflict (tenant_id,alert_key) do update set status='active',summary=excluded.summary,last_seen_at=now(),updated_at=now()
      `, [auth.identity.tenantId, `sms-reply-draft:${parsed.data.eventId}`,
        "The inbound SMS was saved, but Ferocity could not prepare its reply draft.",
        JSON.stringify({ conversationId, safeError: error instanceof Error ? error.message.slice(0, 300) : "unknown" })]);
    }
  }
  if (h4rMetadata?.source === "h4r") {
    const basePayload = {
      event_id: parsed.data.eventId,
      workspace_id: h4rMetadata.h4rWorkspaceId ?? null,
      h4r_conversation_id: h4rMetadata.h4rConversationId ?? null,
      h4r_prospect_id: h4rMetadata.h4rProspectId ?? null,
      provider_message_ref: parsed.data.eventId,
      from: sender,
      to: parsed.data.recipient ?? null,
      body: parsed.data.body,
      occurred_at: parsed.data.receivedAt,
      compliance_keyword: complianceKeyword ?? null,
      conversation_id: conversationId,
    };
    await postH4rCallback({ tenantId: auth.identity.tenantId,
      callbackUrl: typeof h4rMetadata.h4rCallbackUrl === "string" ? h4rMetadata.h4rCallbackUrl : null, payload: {
      ...basePayload,
      event_type: complianceKeyword === "stop" ? "stop" : complianceKeyword === "help" ? "help" : "inbound_message",
    }});
    if (replyDraft && !complianceKeyword) {
      await postH4rCallback({ tenantId: auth.identity.tenantId,
        callbackUrl: typeof h4rMetadata.h4rCallbackUrl === "string" ? h4rMetadata.h4rCallbackUrl : null, payload: {
        event_type: "reply_draft",
        event_id: `${parsed.data.eventId}:draft`,
        workspace_id: h4rMetadata.h4rWorkspaceId ?? null,
        h4r_conversation_id: h4rMetadata.h4rConversationId ?? null,
        h4r_prospect_id: h4rMetadata.h4rProspectId ?? null,
        provider_message_ref: parsed.data.eventId,
        reply_draft: replyDraft.reply,
        confidence: replyDraft.confidence,
        intent: "sms_reply",
        prompt_version: "ferocity-business-brain-review-v1",
        occurred_at: new Date().toISOString(),
      }});
    }
  }
  return NextResponse.json({ ok: true, conversationId, optOutRecorded: complianceKeyword === "stop", complianceReplyQueued,
    replyPrepared: Boolean(replyDraft), replyMode: replyDraft?.mode ?? null });
}
