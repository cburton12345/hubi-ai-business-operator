import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  authenticateFacebookConnector,
  facebookCommunityObservationSchema,
  normalizeFacebookGroupUrl
} from "@/lib/growth/facebook-connector-protocol";
import { queryPostgres } from "@/lib/db/postgres";
import { recordGrowthEvent } from "@/lib/growth/growth-events";

function rulesFingerprint(value?: string) {
  return value ? createHash("sha256").update(value.replace(/\s+/g, " ").trim()).digest("hex") : null;
}

function words(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:observe");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });
  const parsed = facebookCommunityObservationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid Facebook community observation." }, { status: 400 });

  const observation = parsed.data;
  const url = normalizeFacebookGroupUrl(observation.url)!;
  const rulesText = observation.rulesText?.trim() || null;
  const fingerprint = rulesFingerprint(rulesText ?? undefined);
  const brandContext = await queryPostgres<{ industry: string | null; vertical: string | null; primary_location: string | null; services: string[]; locations: string[] }>(`
    select b.industry,b.vertical,b.primary_location,
      coalesce((select array_agg(s.name) from public.brand_services s where s.tenant_id=b.tenant_id and s.brand_id=b.id and s.active=true),array[]::text[]) services,
      coalesce((select array_agg(concat_ws(' ',l.service_area_name,l.city,l.state)) from public.brand_locations l where l.tenant_id=b.tenant_id and l.brand_id=b.id and l.active=true),array[]::text[]) locations
    from public.brands b where b.tenant_id=$1 and b.id=$2 limit 1
  `, [auth.tenant_id, auth.brand_id]);
  const brand = brandContext?.rows[0];
  const haystack = words(`${observation.name} ${observation.discoveryContext || ""}`);
  const focused = words([...(brand?.services ?? []), brand?.industry, brand?.vertical].filter(Boolean).join(" "));
  const local = words([...(brand?.locations ?? []), brand?.primary_location].filter(Boolean).join(" "));
  const focusedMatches = [...focused].filter((term) => haystack.has(term)).length;
  const localMatches = [...local].filter((term) => haystack.has(term)).length;
  const adjacent = /business owners?|entrepreneurs?|professionals?|community|local/i.test(`${observation.name} ${observation.discoveryContext || ""}`);
  const relevanceScore = Math.min(95, 35 + Math.min(35, focusedMatches * 12) + Math.min(20, localMatches * 10) + (adjacent ? 5 : 0));
  const result = await queryPostgres<{ id: string; rules_changed: boolean }>(`
    with previous as (
      select id, md5(coalesce(rules_text,'')) previous_rules_hash
      from public.growth_communities
      where tenant_id=$1 and brand_id=$2 and channel_key='facebook' and name=$5
      limit 1
    ), upserted as (
      insert into public.growth_communities (
        tenant_id,brand_id,identity_id,channel_key,external_community_id,name,url,
        rules_text,rules_source_url,rules_checked_at,relevance_score,posting_policy,status,metadata_json
      ) values ($1,$2,$3,'facebook',$4,$5,$6,$7,$8,
        case when $7 is null then null else coalesce($9::timestamptz,now()) end,
        $10,case when $7 is null then 'suggest_only' else 'approval_required' end,'active',$11::jsonb)
      on conflict (tenant_id,brand_id,channel_key,name) do update set
        identity_id=excluded.identity_id,
        external_community_id=excluded.external_community_id,
        url=excluded.url,
        rules_text=coalesce(excluded.rules_text,public.growth_communities.rules_text),
        rules_source_url=coalesce(excluded.rules_source_url,public.growth_communities.rules_source_url),
        rules_checked_at=coalesce(excluded.rules_checked_at,public.growth_communities.rules_checked_at),
        relevance_score=excluded.relevance_score,
        metadata_json=public.growth_communities.metadata_json || excluded.metadata_json,
        updated_at=now()
      returning id,md5(coalesce(rules_text,'')) current_rules_hash
    )
    select u.id,(p.previous_rules_hash is distinct from u.current_rules_hash) rules_changed
    from upserted u left join previous p on p.id=u.id
  `, [auth.tenant_id, auth.brand_id, auth.identity_id, observation.externalCommunityId, observation.name, url,
    rulesText, observation.rulesSourceUrl ? normalizeFacebookGroupUrl(observation.rulesSourceUrl) : null,
    observation.observedAt ?? null, relevanceScore, JSON.stringify({
      membershipState: observation.membershipState,
      connectorVersion: observation.connectorVersion,
      rulesFingerprint: fingerprint,
      discoverySource: "customer_owned_facebook_session",
      discoveryContext: observation.discoveryContext?.slice(0, 1000) || null,
      relevanceModel: "brand-service-location-v1",
      minimumHoursBetweenPosts: 72
    })]);
  const community = result?.rows[0];
  if (!community) return NextResponse.json({ ok: false, error: "Community could not be recorded." }, { status: 409 });

  await recordGrowthEvent({
    tenantId: auth.tenant_id, brandId: auth.brand_id, identityId: auth.identity_id, communityId: community.id,
    eventType: "community_discovered", channelKey: "facebook", outcome: observation.membershipState,
    contentReference: url, strategyVersion: "facebook-groups-assisted-v1",
    dimensions: { rulesKnown: Boolean(rulesText), connectorVersion: observation.connectorVersion, relevanceScore },
    idempotencyKey: `facebook-community:${observation.providerEventId}`,
    occurredAt: observation.observedAt
  });
  if (rulesText && community.rules_changed) {
    await recordGrowthEvent({
      tenantId: auth.tenant_id, brandId: auth.brand_id, identityId: auth.identity_id, communityId: community.id,
      eventType: "community_rule_detected", channelKey: "facebook", outcome: "needs_owner_review",
      contentReference: observation.rulesSourceUrl ?? url, strategyVersion: "facebook-groups-assisted-v1",
      dimensions: { rulesFingerprint: fingerprint, rulesLength: rulesText.length },
      idempotencyKey: `facebook-community-rules:${observation.providerEventId}:${fingerprint}`,
      occurredAt: observation.observedAt
    });
  }
  return NextResponse.json({ ok: true, communityId: community.id, rulesChanged: community.rules_changed }, { headers: { "Cache-Control": "no-store" } });
}
