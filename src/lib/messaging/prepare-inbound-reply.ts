import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { queryPostgres } from "@/lib/db/postgres";

type ReplyChannel = "sms" | "facebook";

type ReplyDraft = {
  reply: string;
  confidence: number;
  requiresHuman: boolean;
  reason: string;
};

function cleanReply(value: unknown, fallback: string) {
  const reply = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (reply || fallback).slice(0, 1200);
}

export async function prepareInboundReply(input: {
  tenantId: string;
  brandId?: string | null;
  conversationId: string;
  inboundMessageId: string;
  channel: ReplyChannel;
  providerKey: string;
  from: string;
  body: string;
  sourceUrl?: string | null;
  opportunityId?: string | null;
}) {
  const [businessResult, historyResult] = await Promise.all([
    queryPostgres<{ tenant_name: string; brand_name: string | null; description: string | null; industry: string | null }>(`
      select t.name tenant_name,b.name brand_name,b.description,b.industry
      from public.tenants t left join public.brands b on b.tenant_id=t.id and b.id=$2
      where t.id=$1 limit 1
    `, [input.tenantId, input.brandId ?? null]),
    queryPostgres<{ direction: string; body: string }>(`
      select direction,body from public.messages
      where tenant_id=$1 and conversation_id=$2
      order by created_at desc limit 8
    `, [input.tenantId, input.conversationId])
  ]);
  const business = businessResult?.rows[0];
  const businessName = business?.brand_name?.trim() || business?.tenant_name?.trim() || "the business";
  const fallback = `Thanks for reaching out to ${businessName}. We received your message and will follow up shortly.`;
  const history = (historyResult?.rows ?? []).reverse().map((message) => `${message.direction}: ${message.body}`).join("\n");
  const generated = await generateJsonWithAiService<ReplyDraft & Record<string, unknown>>({
    tenantId: input.tenantId,
    brandId: input.brandId,
    featureKey: "inbound_reply_draft",
    runType: `${input.channel}_inbound_reply_draft`,
    system: `Prepare one concise customer reply for ${businessName}. Use only facts in the supplied business context and conversation. Never invent price, availability, guarantees, policies, or completed work. Ask one useful question when information is missing. Flag money, legal, safety, angry-customer, opt-out, or ambiguous matters for a human. Return JSON with reply, confidence from 0 to 100, requiresHuman, and reason.`,
    user: JSON.stringify({
      channel: input.channel,
      business: { name: businessName, description: business?.description, industry: business?.industry },
      latestInbound: input.body,
      recentConversation: history
    }),
    fallback: { reply: fallback, confidence: 40, requiresHuman: true, reason: "AI or verified business context was unavailable; safe acknowledgment prepared." },
    timeoutMs: 7_000,
    metadata: { conversationId: input.conversationId, inboundMessageId: input.inboundMessageId, channel: input.channel }
  });
  const draft = {
    reply: cleanReply(generated.reply, fallback),
    confidence: Math.max(0, Math.min(100, Number(generated.confidence) || 0)),
    requiresHuman: generated.requiresHuman !== false || Number(generated.confidence) < 85,
    reason: typeof generated.reason === "string" ? generated.reason.slice(0, 500) : "Prepared from the current conversation."
  };

  if (input.channel === "facebook" && input.opportunityId) {
    await queryPostgres(`
      update public.growth_opportunities set suggested_response=$3,
        recommended_action='Review the prepared reply, source context, and account health before sending.',
        metadata_json=metadata_json || $4::jsonb,updated_at=now()
      where tenant_id=$1 and id=$2 and suggested_response is null
    `, [input.tenantId, input.opportunityId, draft.reply, JSON.stringify({
      replyDraft: { confidence: draft.confidence, requiresHuman: draft.requiresHuman, reason: draft.reason, source: "business_brain" }
    })]);
    return { ...draft, mode: "prepared_for_review" as const };
  }

  const policy = await queryPostgres<{ id: string; status: string; requires_human_approval: boolean }>(`
    select id,status,requires_human_approval from public.live_action_policies
    where tenant_id=$1 and action_key='inbound_sms_reply' and provider_key=$2 limit 1
  `, [input.tenantId, input.providerKey]);
  const activePolicy = policy?.rows[0];
  const automatic = activePolicy?.status === "live" && !activePolicy.requires_human_approval && !draft.requiresHuman;
  const queued = await queryPostgres<{ id: string }>(`
    insert into public.outbound_action_queue (
      tenant_id,brand_id,action_type,provider_key,status,risk_level,target_type,target_id,
      subject,recipient_label,payload_json,policy_id,metadata_json
    ) select $1,$2,'sms_send',$3,$4,$5,'messaging_conversation',$6,
      'Prepared reply',$7,jsonb_build_object('body',$8),$9,$10::jsonb)
    where not exists (
      select 1 from public.outbound_action_queue
      where tenant_id=$1 and metadata_json->>'inboundMessageId'=$11
    ) returning id
  `, [input.tenantId, input.brandId ?? null, input.providerKey, automatic ? "queued" : "needs_review",
    draft.requiresHuman ? "high" : "medium", input.conversationId, input.from, draft.reply, activePolicy?.id ?? null,
    JSON.stringify({
      source: "inbound_reply_draft", inboundMessageId: input.inboundMessageId, conversationId: input.conversationId,
      confidence: draft.confidence, requiresHuman: draft.requiresHuman, reason: draft.reason,
      communicationMethod: "sms", messagePurpose: "transactional"
    }), input.inboundMessageId]);
  return { ...draft, mode: automatic ? "queued_by_explicit_policy" as const : "prepared_for_review" as const, queueId: queued?.rows[0]?.id ?? null };
}
