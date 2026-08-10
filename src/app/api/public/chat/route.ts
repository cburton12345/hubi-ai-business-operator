import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateJsonWithProvider } from "@/lib/ai/model-provider";
import { queryPostgres } from "@/lib/db/postgres";
import { getIndustryKnowledgeContext, industryContextForPrompt } from "@/lib/industry-knowledge/get-industry-context";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";

const chatSchema = z.object({
  formPublicKey: z.string().min(8).max(180),
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(160).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  consentToContact: z.boolean().default(false),
  website: z.string().max(240).optional()
});

type ChatProfile = {
  form_id: string;
  tenant_id: string;
  brand_id: string;
  brand_name: string;
  industry: string | null;
  primary_goal: string | null;
  tone_of_voice: string | null;
};

type ChatAiResult = {
  reply?: string;
  intent?: string;
  urgency?: "low" | "normal" | "high" | "urgent";
  needsHuman?: boolean;
  reason?: string;
};

function safeReply(value: unknown, fallback: string) {
  const reply = typeof value === "string" ? value.trim().slice(0, 1200) : "";
  return reply || fallback;
}

export async function POST(request: NextRequest) {
  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.website) {
    return NextResponse.json({ error: "Invalid chat message." }, { status: 400 });
  }
  const input = parsed.data;
  const publicLimit = await consumePublicRateLimit({
    request,
    scope: `public-chat:${input.formPublicKey}`,
    limit: 20,
    windowSeconds: 60 * 60
  });
  if (!publicLimit.allowed) {
    return NextResponse.json({ error: "Chat limit reached. Please use the contact form." }, { status: 429 });
  }
  const profileResult = await queryPostgres<ChatProfile>(
    `
    select f.id as form_id, f.tenant_id, f.brand_id, b.name as brand_name, b.industry,
      b.primary_goal, s.tone_of_voice
    from public.forms f
    join public.brands b on b.id = f.brand_id and b.tenant_id = f.tenant_id
    left join public.brand_marketing_settings s on s.brand_id = b.id and s.tenant_id = b.tenant_id
    where f.public_key = $1 and f.active = true and b.status = 'active'
    limit 1
    `,
    [input.formPublicKey]
  );
  const profile = profileResult?.rows[0];
  if (!profile) return NextResponse.json({ error: "Chat is not available." }, { status: 404 });

  const externalRef = `${input.formPublicKey}:${input.sessionId}`;
  const rateResult = await queryPostgres<{ session_messages: string; form_messages: string }>(
    `
    select
      (select count(*) from public.messages m
        join public.messaging_conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
        where c.tenant_id = $1 and c.provider_key = 'ferocity_web_chat'
          and c.external_conversation_ref = $2 and m.direction = 'inbound'
          and m.created_at >= now() - interval '1 hour')::text as session_messages,
      (select count(*) from public.messages m
        join public.messaging_conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
        where c.tenant_id = $1 and c.provider_key = 'ferocity_web_chat'
          and c.metadata_json->>'formPublicKey' = $3 and m.direction = 'inbound'
          and m.created_at >= now() - interval '1 minute')::text as form_messages
    `,
    [profile.tenant_id, externalRef, input.formPublicKey]
  );
  const rate = rateResult?.rows[0];
  if (Number(rate?.session_messages ?? 0) >= 12 || Number(rate?.form_messages ?? 0) >= 60) {
    return NextResponse.json({ error: "Chat limit reached. Please use the contact form." }, { status: 429 });
  }

  const existingConversation = await queryPostgres<{ lead_id: string | null }>(
    `
    select lead_id from public.messaging_conversations
    where tenant_id = $1 and provider_key = 'ferocity_web_chat' and external_conversation_ref = $2
    limit 1
    `,
    [profile.tenant_id, externalRef]
  );
  let leadId: string | null = existingConversation?.rows[0]?.lead_id ?? null;
  if (!leadId && (input.email || input.phone) && input.consentToContact) {
    const matchingLead = await queryPostgres<{ id: string }>(
      `
      select id from public.leads
      where tenant_id = $1 and brand_id = $2 and status <> 'spam'
        and created_at >= now() - interval '30 days'
        and (
          ($3::text is not null and lower(email) = lower($3))
          or ($4::text is not null and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = regexp_replace($4, '\\D', '', 'g'))
        )
      order by created_at desc limit 1
      `,
      [profile.tenant_id, profile.brand_id, input.email || null, input.phone || null]
    );
    leadId = matchingLead?.rows[0]?.id ?? null;
  }
  if (!leadId && (input.email || input.phone) && input.consentToContact) {
    const lead = await createPublicLead({
      formPublicKey: input.formPublicKey,
      source: "website_chat",
      sourceDetail: "ferocity_web_chat",
      name: input.name || undefined,
      email: input.email || undefined,
      phone: input.phone || undefined,
      message: input.message,
      leadType: "general",
      consentToContact: true,
      utm: {},
      details: { chatSessionId: input.sessionId }
    }, {
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") ?? undefined
    });
    if (lead.ok) leadId = lead.leadId ?? null;
  }

  const conversation = await queryPostgres<{ id: string; lead_id: string | null }>(
    `
    insert into public.messaging_conversations (
      tenant_id, brand_id, lead_id, channel, provider_key, external_conversation_ref,
      subject, status, last_message_at, metadata_json
    )
    values ($1,$2,$3,'website_chat','ferocity_web_chat',$4,$5,'open',now(),$6::jsonb)
    on conflict (tenant_id, provider_key, external_conversation_ref) do update
    set lead_id = coalesce(public.messaging_conversations.lead_id, excluded.lead_id),
        status = 'open', last_message_at = now(), updated_at = now()
    returning id, lead_id
    `,
    [
      profile.tenant_id,
      profile.brand_id,
      leadId,
      externalRef,
      `Website chat with ${input.name || "visitor"}`,
      JSON.stringify({ formPublicKey: input.formPublicKey, sessionId: input.sessionId, source: "public_web_chat" })
    ]
  );
  const conversationRow = conversation?.rows[0];
  if (!conversationRow) return NextResponse.json({ error: "Unable to start chat." }, { status: 500 });

  await queryPostgres(
    `
    insert into public.messages (
      tenant_id, conversation_id, direction, channel, provider_key, from_value, body,
      status, ai_generated, idempotency_key, received_at, metadata_json
    )
    values ($1,$2,'inbound','website_chat','ferocity_web_chat',$3,$4,'received',false,$5,now(),$6::jsonb)
    on conflict (tenant_id, idempotency_key) do nothing
    `,
    [
      profile.tenant_id,
      conversationRow.id,
      input.name || "Website visitor",
      input.message,
      `web-chat-in:${input.sessionId}:${randomUUID()}`,
      JSON.stringify({ leadId: conversationRow.lead_id, consentToContact: input.consentToContact })
    ]
  );

  const recent = await queryPostgres<{ direction: string; body: string }>(
    `
    select direction, body from public.messages
    where tenant_id = $1 and conversation_id = $2 and status <> 'archived'
    order by created_at desc limit 8
    `,
    [profile.tenant_id, conversationRow.id]
  );
  const industry = await getIndustryKnowledgeContext({
    tenantId: profile.tenant_id,
    brandId: profile.brand_id,
    categories: ["intake", "qualification", "scheduling", "safety", "compliance"]
  });
  const fallback = {
    reply: `Thanks for contacting ${profile.brand_name}. I can help collect the details and route the right next step. What service do you need, where is the property, and how soon do you need help?`,
    intent: "general_intake",
    urgency: "normal" as const,
    needsHuman: false,
    reason: "Continue safe intake."
  };
  const ai = await generateJsonWithProvider<ChatAiResult>({
    tenantId: profile.tenant_id,
    brandId: profile.brand_id,
    runType: "public_website_chat_reply",
    system: [
      `You are Ferocity's AI website receptionist for ${profile.brand_name}.`,
      "Reply in plain language using at most 120 words.",
      "Collect useful intake details, answer only from supplied business/industry context, and offer the public contact or booking path when appropriate.",
      "Never invent price, availability, credentials, insurance coverage, code conclusions, diagnoses, warranties, or guarantees.",
      "Set needsHuman=true for emergencies, safety, legal threats, anger, payment disputes, uncertain high-risk facts, or a direct request for a person.",
      "Return JSON with reply, intent, urgency, needsHuman, and reason.",
      industryContextForPrompt(industry)
    ].join("\n"),
    user: [
      `Business goal: ${profile.primary_goal ?? "Help customers take the right next step."}`,
      `Tone: ${profile.tone_of_voice ?? "Direct, helpful, and concise."}`,
      "Recent conversation:",
      ...(recent?.rows ?? []).reverse().map((turn) => `${turn.direction}: ${turn.body}`)
    ].join("\n"),
    fallback,
    timeoutMs: 6_000
  });
  const reply = safeReply(ai.reply, fallback.reply);
  const needsHuman = Boolean(ai.needsHuman) || ai.urgency === "urgent";

  await queryPostgres(
    `
    insert into public.messages (
      tenant_id, conversation_id, direction, channel, provider_key, from_value, body,
      status, ai_generated, idempotency_key, sent_at, metadata_json
    )
    values ($1,$2,'outbound','website_chat','ferocity_web_chat','Ferocity AI',$3,'sent',true,$4,now(),$5::jsonb)
    `,
    [
      profile.tenant_id,
      conversationRow.id,
      reply,
      `web-chat-out:${input.sessionId}:${randomUUID()}`,
      JSON.stringify({ intent: ai.intent ?? "general_intake", urgency: ai.urgency ?? "normal", needsHuman, reason: ai.reason ?? null })
    ]
  );
  await queryPostgres(
    `
    update public.messaging_conversations
    set status = $3, last_message_at = now(), updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [profile.tenant_id, conversationRow.id, needsHuman ? "human_handoff" : "ai_handled"]
  );

  if (needsHuman) {
    await queryPostgres(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, risk_type, confidence_score, metadata_json
      )
      values ($1,'ferocity','Ferocity',$2,'website_chat.handoff','Website chat needs a person',$3,
        $4,'needs_owner',true,false,$3,'Open Messaging and continue the conversation.',
        '/app/messaging','customer',82,$5::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
      do update set summary = excluded.summary, severity = excluded.severity, status = 'needs_owner',
        owner_attention = true, metadata_json = excluded.metadata_json, occurred_at = now(), updated_at = now()
      `,
      [
        profile.tenant_id,
        `website-chat:${conversationRow.id}`,
        ai.reason || "The visitor needs human help.",
        ai.urgency === "urgent" ? "critical" : "high",
        JSON.stringify({ conversationId: conversationRow.id, leadId: conversationRow.lead_id, intent: ai.intent ?? null })
      ]
    );
  }

  return NextResponse.json({
    reply,
    needsHuman,
    leadCaptured: Boolean(conversationRow.lead_id),
    formUrl: `/forms/${input.formPublicKey}`,
    bookingUrl: `/book/${input.formPublicKey}`
  });
}
