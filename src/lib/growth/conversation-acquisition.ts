import { createHash, randomBytes } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

export const acquisitionTokenPattern = /\bFRC-([A-Z0-9]{12})\b/i;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function compactToken() {
  return randomBytes(9).toString("base64url").toUpperCase().replace(/[-_]/g, "X").slice(0, 12);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function createConversationAcquisitionLink(input: {
  tenantId: string;
  brandId: string;
  userId?: string | null;
  name: string;
  preferredChannel: string;
  destination?: string | null;
  prefilledMessage: string;
  source?: string | null;
  campaign?: string | null;
  adReference?: string | null;
  fallbackUrl?: string | null;
}) {
  const base = slugify(input.name) || "conversation";
  const slug = `${base}-${randomBytes(4).toString("hex")}`.slice(0, 79);
  const result = await queryPostgres<{ id: string; slug: string }>(
    `insert into public.conversation_acquisition_links
      (tenant_id,brand_id,slug,name,status,preferred_channel,destination_value,prefilled_message,source_name,campaign_reference,
       ad_reference,utm_source,utm_medium,utm_campaign,fallback_url,created_by_user_id,metadata_json)
     values ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$8,'conversation',$9,$11,$12,'{"createdIn":"growth"}'::jsonb)
     returning id,slug`,
    [input.tenantId, input.brandId, slug, input.name, input.preferredChannel, input.destination ?? null, input.prefilledMessage,
      input.source ?? null, input.campaign ?? null, input.adReference ?? null, input.fallbackUrl ?? null, input.userId ?? null]
  );
  return result?.rows[0] ?? null;
}

export function buildConversationDestination(input: {
  channel: string;
  destination: string | null;
  message: string;
  fallbackUrl: string | null;
}) {
  const destination = (input.destination ?? "").replace(/\s+/g, "");
  const message = encodeURIComponent(input.message);
  if (["sms", "mms", "rcs"].includes(input.channel) && destination) return `sms:${destination}?body=${message}`;
  if (input.channel === "whatsapp" && destination) return `https://wa.me/${destination.replace(/^\+/, "")}?text=${message}`;
  if (input.channel === "phone" && destination) return `tel:${destination}`;
  if (input.channel === "meta_messenger" && input.fallbackUrl) return input.fallbackUrl;
  if (input.channel === "instagram" && input.fallbackUrl) return input.fallbackUrl;
  if (input.channel === "apple_business_chat" && input.fallbackUrl) return input.fallbackUrl;
  return input.fallbackUrl ?? "/support";
}

export async function openConversationAcquisitionLink(input: {
  slug: string;
  query: Record<string, string>;
  userAgent?: string | null;
  referrer?: string | null;
  ip?: string | null;
}) {
  const result = await queryPostgres<{
    id: string; tenant_id: string; brand_id: string; status: string; preferred_channel: string;
    destination_value: string | null; prefilled_message: string; fallback_url: string | null;
    source_name: string | null; campaign_reference: string | null; ad_reference: string | null;
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null;
  }>(
    `select id,tenant_id,brand_id,status,preferred_channel,destination_value,prefilled_message,fallback_url,
      source_name,campaign_reference,ad_reference,utm_source,utm_medium,utm_campaign,utm_content,utm_term
     from public.conversation_acquisition_links where slug=$1 and status='active' and (expires_at is null or expires_at>now()) limit 1`,
    [input.slug.toLowerCase()]
  );
  const link = result?.rows[0];
  if (!link) return null;
  const token = compactToken();
  const tokenLabel = `FRC-${token}`;
  const attribution = {
    source: input.query.utm_source || link.utm_source || link.source_name,
    medium: input.query.utm_medium || link.utm_medium,
    campaign: input.query.utm_campaign || link.utm_campaign || link.campaign_reference,
    content: input.query.utm_content || link.utm_content,
    term: input.query.utm_term || link.utm_term,
    adId: input.query.ad_id || input.query.adid || link.ad_reference,
    fbclid: input.query.fbclid,
    fbc: input.query.fbc,
    fbp: input.query.fbp,
    gclid: input.query.gclid,
    ttclid: input.query.ttclid,
    msclkid: input.query.msclkid
  };
  const click = await queryPostgres<{ id: string }>(
    `insert into public.conversation_acquisition_clicks
      (tenant_id,brand_id,link_id,token_hash,token_preview,request_attribution_json,user_agent,referrer,ip_hash)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) returning id`,
    [link.tenant_id, link.brand_id, link.id, hash(tokenLabel.toUpperCase()), `…${token.slice(-4)}`, JSON.stringify(attribution),
      input.userAgent?.slice(0, 1000) ?? null, input.referrer?.slice(0, 2000) ?? null, input.ip ? hash(`${link.tenant_id}:${input.ip}`) : null]
  );
  if (click?.rows[0]?.id) {
    await queryPostgres(
      `update public.conversation_acquisition_clicks set status='destination_opened' where tenant_id=$1 and id=$2`,
      [link.tenant_id, click.rows[0].id]
    );
  }
  const message = `${link.prefilled_message.trim()}\n\n${tokenLabel}`.slice(0, 1500);
  let desktopFallback: string | null = null;
  if (link.fallback_url) {
    try {
      const fallback = new URL(link.fallback_url);
      fallback.searchParams.set("ferocity_attribution", tokenLabel);
      desktopFallback = fallback.toString();
    } catch {
      desktopFallback = null;
    }
  }
  return {
    clickId: click?.rows[0]?.id ?? null,
    channel: link.preferred_channel,
    destination: buildConversationDestination({ channel: link.preferred_channel, destination: link.destination_value, message, fallbackUrl: link.fallback_url }),
    fallbackUrl: link.fallback_url,
    desktopFallback,
    tokenLabel
  };
}

export async function matchInboundAcquisitionToken(input: {
  tenantId: string;
  body: string;
  conversationId: string;
  contactValue?: string | null;
  leadId?: string | null;
  customerId?: string | null;
}) {
  const match = input.body.match(acquisitionTokenPattern);
  if (!match) return null;
  const tokenLabel = `FRC-${match[1].toUpperCase()}`;
  const result = await queryPostgres<{
    id: string; brand_id: string; link_id: string; request_attribution_json: Record<string, string | null>;
    source_name: string | null; campaign_reference: string | null; preferred_channel: string;
  }>(
    `select click.id,click.brand_id,click.link_id,click.request_attribution_json,
      link.source_name,link.campaign_reference,link.preferred_channel
     from public.conversation_acquisition_clicks click
     join public.conversation_acquisition_links link on link.id=click.link_id and link.tenant_id=click.tenant_id
     where click.tenant_id=$1 and click.token_hash=$2 and click.expires_at>now() limit 1`,
    [input.tenantId, hash(tokenLabel)]
  );
  const click = result?.rows[0];
  if (!click) return null;
  let leadId = input.leadId ?? null;
  if (!leadId && !input.customerId && input.contactValue) {
    const normalizedPhone = input.contactValue.replace(/\D/g, "");
    const normalizedEmail = input.contactValue.trim().toLowerCase();
    const existingLead = await queryPostgres<{ id: string }>(
      `select id from public.leads
       where tenant_id=$1 and brand_id=$2
         and (($3<>'' and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$3) or ($4 like '%@%' and lower(email)=$4))
       order by created_at desc limit 1`,
      [input.tenantId, click.brand_id, normalizedPhone, normalizedEmail]
    );
    leadId = existingLead?.rows[0]?.id ?? null;
    if (!leadId) {
      const createdLead = await queryPostgres<{ id: string }>(
        `insert into public.leads
          (tenant_id,brand_id,source,source_detail,name,email,phone,message,status,qualification_status,consent_to_contact,metadata_json)
         values ($1,$2,$3,$4,'New conversation',case when $5 like '%@%' then $5 else null end,
           case when $5 not like '%@%' then $5 else null end,$6,'new','unqualified',false,$7::jsonb)
         returning id`,
        [input.tenantId, click.brand_id, click.preferred_channel, "tracked_conversation_link", input.contactValue.trim(),
          input.body.replace(acquisitionTokenPattern, "").trim().slice(0, 5000),
          JSON.stringify({ acquisitionClickId: click.id, conversationLinkId: click.link_id, replyConsentOnly: true })]
      );
      leadId = createdLead?.rows[0]?.id ?? null;
    }
  }
  const sourceName = click.request_attribution_json.source || click.source_name || "conversation_link";
  const campaignReference = click.request_attribution_json.campaign || click.campaign_reference;
  await Promise.all([
    queryPostgres(
      `update public.conversation_acquisition_clicks set status='conversation_matched',conversation_id=$3,
       lead_id=coalesce($4,lead_id),customer_id=coalesce($5,customer_id),matched_at=now(),metadata_json=metadata_json || $6::jsonb
       where tenant_id=$1 and id=$2`,
      [input.tenantId, click.id, input.conversationId, leadId, input.customerId ?? null, JSON.stringify({ matchedToken: true })]
    ),
    queryPostgres(
      `update public.messaging_conversations set lead_id=coalesce(lead_id,$3),metadata_json=metadata_json || $4::jsonb,updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, input.conversationId, leadId, JSON.stringify({ acquisitionClickId: click.id, conversationLinkId: click.link_id, attribution: click.request_attribution_json })]
    ),
    queryPostgres(
      `insert into public.growth_attribution_touches
        (tenant_id,brand_id,conversation_id,lead_id,customer_id,channel_key,source_name,campaign_reference,touch_role,reference_key,
         conversation_link_id,acquisition_click_id,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'first',$9,$10,$11,$12::jsonb)
       on conflict (tenant_id,reference_key) do update set conversation_id=excluded.conversation_id,
         lead_id=coalesce(excluded.lead_id,public.growth_attribution_touches.lead_id),
         customer_id=coalesce(excluded.customer_id,public.growth_attribution_touches.customer_id),metadata_json=excluded.metadata_json`,
      [input.tenantId, click.brand_id, input.conversationId, leadId, input.customerId ?? null, click.preferred_channel,
        sourceName, campaignReference, `conversation-link:${click.id}`, click.link_id, click.id, JSON.stringify(click.request_attribution_json)]
    ),
    queryPostgres(
      `insert into public.growth_events
        (tenant_id,brand_id,conversation_id,lead_id,customer_id,event_type,channel_key,campaign_reference,outcome,attribution_json,idempotency_key)
       values ($1,$2,$3,$4,$5,'conversation_started',$6,$7,'matched',$8::jsonb,$9)
       on conflict (tenant_id,idempotency_key) where idempotency_key is not null do nothing`,
      [input.tenantId, click.brand_id, input.conversationId, leadId, input.customerId ?? null, click.preferred_channel,
        campaignReference, JSON.stringify(click.request_attribution_json), `conversation-link-event:${click.id}`]
    )
  ]);
  return { clickId: click.id, linkId: click.link_id, leadId };
}
