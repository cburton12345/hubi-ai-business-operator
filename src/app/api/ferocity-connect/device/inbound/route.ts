import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { queryPostgres } from "@/lib/db/postgres";
import { recordInboundResponse } from "@/lib/messaging/record-inbound-response";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { classifySmsKeyword, normalizeSmsKeyword } from "@/lib/messaging/sms-policy";

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
  return NextResponse.json({ ok: true, conversationId, optOutRecorded: complianceKeyword === "stop", complianceReplyQueued });
}
