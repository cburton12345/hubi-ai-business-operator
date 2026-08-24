import { queryPostgres } from "@/lib/db/postgres";
import { getGrowthChannel, scoreGrowthOpportunity } from "./distribution-engine";
import { recordGrowthEvent } from "./growth-events";

const messagingChannel: Record<string, string> = {
  facebook: "facebook_messenger", instagram: "instagram", reddit: "reddit", linkedin: "linkedin", x: "x",
  nextdoor: "nextdoor", craigslist: "craigslist", google_business_profile: "google_business_profile",
  email: "email", sms: "sms", website: "website_chat"
};

export type InboundGrowthEngagement = {
  tenantId: string;
  brandId: string;
  channelKey: string;
  identityId?: string;
  objectiveId?: string;
  communityId?: string;
  providerEventId: string;
  externalConversationRef: string;
  externalActorId: string;
  displayName?: string;
  profileUrl?: string;
  body: string;
  sourceUrl?: string;
  serviceTerms?: string[];
  geographyTerms?: string[];
  strategyVersion?: string;
  promptVersion?: string;
  rawEvent?: Record<string, unknown>;
};

export async function ingestGrowthEngagement(input: InboundGrowthEngagement) {
  const channel = getGrowthChannel(input.channelKey);
  if (!channel) throw new Error("Unsupported growth channel");
  const eventKey = `growth-inbound:${channel.providerKey}:${input.providerEventId}`;
  const conversation = await queryPostgres<{ id: string }>(`
    insert into public.messaging_conversations (
      tenant_id, brand_id, channel, provider_key, external_conversation_ref, subject, status,
      unread_count, last_message_at, last_inbound_at, metadata_json
    ) values ($1,$2,$3,$4,$5,'Growth conversation','open',1,now(),now(),$6::jsonb)
    on conflict (tenant_id, provider_key, external_conversation_ref) do update set
      unread_count = public.messaging_conversations.unread_count + 1,
      last_message_at = now(), last_inbound_at = now(), updated_at = now(),
      metadata_json = public.messaging_conversations.metadata_json || excluded.metadata_json
    returning id
  `, [input.tenantId, input.brandId, messagingChannel[input.channelKey] ?? "internal", channel.providerKey,
    input.externalConversationRef, JSON.stringify({ growthObjectiveId: input.objectiveId, growthCommunityId: input.communityId, sourceChannel: input.channelKey })]);
  const conversationId = conversation?.rows[0]?.id;
  if (!conversationId) throw new Error("Unable to create growth conversation");

  await queryPostgres(`
    insert into public.conversation_participants (
      tenant_id, conversation_id, participant_type, display_name, contact_channel, contact_value, metadata_json
    ) select $1,$2,'lead',$3,null,null,$4::jsonb
    where not exists (
      select 1 from public.conversation_participants p
      where p.tenant_id = $1 and p.conversation_id = $2 and p.metadata_json->>'externalActorId' = $5
    )
  `, [input.tenantId, conversationId, input.displayName ?? null,
    JSON.stringify({ externalActorId: input.externalActorId, profileUrl: input.profileUrl, channelKey: input.channelKey }), input.externalActorId]);

  const message = await queryPostgres<{ id: string }>(`
    insert into public.messages (
      tenant_id, conversation_id, direction, channel, provider_key, provider_message_ref,
      body, status, idempotency_key, received_at, metadata_json
    ) values ($1,$2,'inbound',$3,$4,$5,$6,'received',$7,now(),$8::jsonb)
    on conflict (tenant_id, idempotency_key) do nothing returning id
  `, [input.tenantId, conversationId, messagingChannel[input.channelKey] ?? "internal", channel.providerKey,
    input.providerEventId, input.body, eventKey, JSON.stringify({ sourceUrl: input.sourceUrl, growthIdentityId: input.identityId })]);

  await queryPostgres(`
    insert into public.growth_contact_identities (
      tenant_id, brand_id, channel_key, provider_key, external_actor_id, display_name, profile_url,
      conversation_id, match_confidence, match_status, match_method, provenance_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,100,'unlinked','channel_identifier',$9::jsonb)
    on conflict (tenant_id, channel_key, provider_key, external_actor_id) do update set
      display_name = coalesce(excluded.display_name, public.growth_contact_identities.display_name),
      profile_url = coalesce(excluded.profile_url, public.growth_contact_identities.profile_url),
      conversation_id = excluded.conversation_id, last_seen_at = now(), updated_at = now()
  `, [input.tenantId, input.brandId, input.channelKey, channel.providerKey, input.externalActorId,
    input.displayName ?? null, input.profileUrl ?? null, conversationId, JSON.stringify({ providerEventId: input.providerEventId })]);

  const score = scoreGrowthOpportunity({ text: input.body, serviceTerms: input.serviceTerms, geographyTerms: input.geographyTerms, objectiveTerms: ["quote", "estimate", "recommend", "available"] });
  const opportunity = await queryPostgres<{ id: string }>(`
    insert into public.growth_opportunities (
      tenant_id, brand_id, objective_id, identity_id, community_id, conversation_id, channel_key,
      external_reference, external_actor_id, source_url, author_label, body_excerpt, detected_intent,
      intent_score, geography_score, objective_score, overall_score, status, idempotency_key, metadata_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'expressed_demand',$13,$14,$15,$16,'needs_review',$17,$18::jsonb)
    on conflict (tenant_id, idempotency_key) where idempotency_key is not null do update set updated_at = now()
    returning id
  `, [input.tenantId, input.brandId, input.objectiveId ?? null, input.identityId ?? null, input.communityId ?? null,
    conversationId, input.channelKey, input.providerEventId, input.externalActorId, input.sourceUrl ?? null,
    input.displayName ?? null, input.body, score.intentScore, score.geographyScore, score.objectiveScore, score.overallScore,
    eventKey, JSON.stringify({ rawPreservedInGrowthEvent: true, strategyVersion: input.strategyVersion, promptVersion: input.promptVersion })]);
  const opportunityId = opportunity?.rows[0]?.id;

  if (message?.rows[0]) {
    await recordGrowthEvent({
      tenantId: input.tenantId, brandId: input.brandId, objectiveId: input.objectiveId, identityId: input.identityId,
      communityId: input.communityId, opportunityId, conversationId, eventType: "inbound_engagement",
      channelKey: input.channelKey, strategyVersion: input.strategyVersion, promptVersion: input.promptVersion,
      outcome: "captured", idempotencyKey: eventKey, rawEvent: input.rawEvent,
      dimensions: { externalActorId: input.externalActorId, providerEventId: input.providerEventId, overallScore: score.overallScore }
    });
  }
  return { duplicate: !message?.rows[0], conversationId, opportunityId, score };
}
