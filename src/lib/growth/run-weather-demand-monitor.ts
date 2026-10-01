import { queryPostgres } from "@/lib/db/postgres";
import { getPushNotificationPreferences, pushPreferencesAllowEvent } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import {
  alertMatchesTextServiceArea,
  classifyWeatherDemand,
  normalizeNwsAlert,
  type NormalizedWeatherAlert,
  type NwsAlertFeature
} from "@/lib/growth/weather-demand-signals";

type ServiceAreaRow = {
  id: string;
  tenant_id: string;
  brand_id: string;
  brand_name: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: string | null;
  longitude: string | null;
};

type LeadEvidence = {
  recent_storm_leads: string;
  baseline_storm_leads: string;
};

type NwsAlertCollection = {
  features?: NwsAlertFeature[];
};

export type WeatherDemandMonitorResult = {
  skipped: boolean;
  serviceAreasChecked: number;
  alertsMatched: number;
  demandSignalsCorroborated: number;
  recommendationsPrepared: number;
  failures: Array<{ serviceAreaId: string; message: string }>;
  elapsedMs: number;
};

const NWS_BASE_URL = "https://api.weather.gov/alerts/active";
const STORM_LANGUAGE = "(storm|hail|tornado|damaging wind|wind damage|roof damage|tree damage|ice damage|blizzard)";

function boundedConcurrency(value: number | undefined) {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(Math.floor(value!), 6));
}

function nwsUrl(area: ServiceAreaRow) {
  const latitude = Number(area.latitude);
  const longitude = Number(area.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const url = new URL(NWS_BASE_URL);
    url.searchParams.set("point", `${latitude.toFixed(4)},${longitude.toFixed(4)}`);
    return { url: url.toString(), pointScoped: true };
  }
  const state = (area.state ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) return null;
  const url = new URL(NWS_BASE_URL);
  url.searchParams.set("area", state);
  return { url: url.toString(), pointScoped: false };
}

async function mapConcurrent<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await operation(items[index]!);
    }
  });
  await Promise.all(workers);
}

async function leadEvidence(tenantId: string, brandId: string) {
  const result = await queryPostgres<LeadEvidence>(
    `
    select
      count(*) filter (where l.created_at >= now() - interval '24 hours')::text as recent_storm_leads,
      count(*) filter (
        where l.created_at >= now() - interval '8 days'
          and l.created_at < now() - interval '24 hours'
      )::text as baseline_storm_leads
    from public.leads l
    left join public.local_service_lead_details d on d.lead_id = l.id
    where l.tenant_id = $1
      and l.brand_id = $2
      and concat_ws(' ', l.message, l.source_detail, d.service_interest) ~* $3
    `,
    [tenantId, brandId, STORM_LANGUAGE]
  );
  const row = result?.rows[0];
  return {
    recentStormLeads: Number(row?.recent_storm_leads ?? 0),
    baselineDailyStormLeads: Number(row?.baseline_storm_leads ?? 0) / 7
  };
}

async function upsertSignal(input: {
  area: ServiceAreaRow;
  alert: NonNullable<ReturnType<typeof normalizeNwsAlert>>;
  classification: ReturnType<typeof classifyWeatherDemand>;
}) {
  const result = await queryPostgres<{ id: string; push_notified_at: Date | null; push_notification_claim: string | null }>(
    `
    insert into public.weather_demand_signals (
      tenant_id, brand_id, service_area_target_id, provider_key, external_alert_id,
      event_name, headline, severity, certainty, urgency, area_description,
      effective_at, expires_at, source_url, signal_status, service_relevance_score,
      demand_confidence_score, opportunity_score, demand_evidence_json, source_payload_json
    )
    values (
      $1, $2, $3, 'nws', $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb
    )
    on conflict (tenant_id, brand_id, service_area_target_id, provider_key, external_alert_id)
    do update set
      event_name = excluded.event_name,
      headline = excluded.headline,
      severity = excluded.severity,
      certainty = excluded.certainty,
      urgency = excluded.urgency,
      area_description = excluded.area_description,
      effective_at = excluded.effective_at,
      expires_at = excluded.expires_at,
      source_url = excluded.source_url,
      signal_status = case
        when public.weather_demand_signals.signal_status = 'dismissed' then 'dismissed'
        else excluded.signal_status
      end,
      service_relevance_score = excluded.service_relevance_score,
      demand_confidence_score = excluded.demand_confidence_score,
      opportunity_score = excluded.opportunity_score,
      demand_evidence_json = excluded.demand_evidence_json,
      source_payload_json = excluded.source_payload_json,
      last_seen_at = now(),
      updated_at = now()
    returning id, push_notified_at, push_notification_claim
    `,
    [
      input.area.tenant_id,
      input.area.brand_id,
      input.area.id,
      input.alert.externalId,
      input.alert.eventName,
      input.alert.headline || null,
      input.alert.severity,
      input.alert.certainty,
      input.alert.urgency,
      input.alert.areaDescription || null,
      input.alert.effectiveAt,
      input.alert.expiresAt,
      input.alert.sourceUrl,
      input.classification.signalStatus,
      input.alert.serviceRelevanceScore,
      input.classification.demandConfidenceScore,
      input.classification.opportunityScore,
      JSON.stringify(input.classification.evidence),
      JSON.stringify(input.alert.sourcePayload)
    ]
  );
  const row = result?.rows[0];
  return row ? {
    id: row.id,
    pushNotifiedAt: row.push_notified_at,
    pushNotificationClaim: row.push_notification_claim
  } : null;
}

async function upsertRecommendation(input: {
  area: ServiceAreaRow;
  alert: NonNullable<ReturnType<typeof normalizeNwsAlert>>;
  classification: ReturnType<typeof classifyWeatherDemand>;
  signalId: string;
}) {
  const demand = input.classification.demandCorroborated;
  const place = input.area.name || input.area.city || input.alert.areaDescription || "the service area";
  const title = demand
    ? `Verified storm-related demand is rising in ${place}`
    : `Severe weather may create a timely service opportunity in ${place}`;
  const evidence = input.classification.evidence;
  const triggerReason = demand
    ? `${input.alert.eventName} is active and Ferocity independently found ${evidence.recentStormLeads} storm-related lead(s) in the last 24 hours versus a ${evidence.baselineDailyStormLeads}/day baseline.`
    : `${input.alert.eventName} is active for this service area. Ferocity has not found enough internal lead activity to claim demand is rising.`;
  const recommendationKey = `weather_demand_${input.area.id}`;
  const sourceSignals = {
    source: "National Weather Service",
    sourceUrl: input.alert.sourceUrl,
    externalAlertId: input.alert.externalId,
    eventName: input.alert.eventName,
    serviceArea: place,
    ...evidence
  };
  const metadata = {
    createdByAgent: "weather_demand_monitor",
    weatherSignalId: input.signalId,
    noLivePublishing: true,
    approvalRequired: true,
    claimAllowed: evidence.claimAllowed
  };

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_campaign_recommendations (
      tenant_id, brand_id, recommendation_key, title, trigger_reason, primary_goal,
      recommended_channels, recommended_outputs_json, expected_impact, difficulty,
      priority_score, source_signals_json, metadata_json
    )
    values ($1, $2, $3, $4, $5, 'capture timely service demand', $6, $7::jsonb, $8, 'medium', $9, $10::jsonb, $11::jsonb)
    on conflict (tenant_id, brand_id, recommendation_key) do update set
      title = excluded.title,
      trigger_reason = excluded.trigger_reason,
      primary_goal = excluded.primary_goal,
      recommended_channels = excluded.recommended_channels,
      recommended_outputs_json = excluded.recommended_outputs_json,
      expected_impact = excluded.expected_impact,
      difficulty = excluded.difficulty,
      priority_score = excluded.priority_score,
      source_signals_json = excluded.source_signals_json,
      metadata_json = public.marketing_campaign_recommendations.metadata_json || excluded.metadata_json,
      status = case
        when public.marketing_campaign_recommendations.status in ('dismissed', 'paused')
          then public.marketing_campaign_recommendations.status
        else 'recommended'
      end,
      updated_at = now()
    returning id
    `,
    [
      input.area.tenant_id,
      input.area.brand_id,
      recommendationKey,
      title,
      triggerReason,
      ["website", "Google Business Profile", "Facebook", "email"],
      JSON.stringify(["service-area update", "customer reactivation draft", "safety-first social post", "search ad draft"]),
      demand ? "Respond while verified customer interest and weather conditions overlap." : "Prepare useful, local messaging without claiming unverified demand.",
      input.classification.opportunityScore,
      JSON.stringify(sourceSignals),
      JSON.stringify(metadata)
    ]
  );
  return Boolean(result?.rows[0]?.id);
}

export async function runWeatherDemandMonitor(options: {
  locationLimit?: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<WeatherDemandMonitorResult> {
  const started = Date.now();
  const locationLimit = Math.max(1, Math.min(Math.floor(options.locationLimit ?? 100), 500));
  const fetchImpl = options.fetchImpl ?? fetch;
  const failures: WeatherDemandMonitorResult["failures"] = [];
  let alertsMatched = 0;
  let demandSignalsCorroborated = 0;
  let recommendationsPrepared = 0;

  await queryPostgres(
    `
    update public.weather_demand_signals
    set signal_status = 'expired', updated_at = now()
    where expires_at < now() and signal_status not in ('dismissed', 'expired')
    `
  );

  const locations = await queryPostgres<ServiceAreaRow>(
    `
    select
      s.id, s.tenant_id, s.brand_id, b.name as brand_name, s.name, s.city, s.state,
      s.latitude::text, s.longitude::text
    from public.service_area_targets s
    join public.brands b on b.id = s.brand_id and b.tenant_id = s.tenant_id
    where s.status = 'active'
      and b.status = 'active'
      and b.business_model = 'local_service'
      and (s.state is not null or (s.latitude is not null and s.longitude is not null))
      and (
        concat_ws(' ', b.industry, b.vertical, b.description) ~* '(roof|exterior|siding|gutter|restoration|tree|storm)'
        or exists (
          select 1 from public.brand_services bs
          where bs.brand_id = b.id and bs.active = true
            and concat_ws(' ', bs.name, bs.description) ~* '(roof|exterior|siding|gutter|restoration|tree|storm)'
        )
      )
    order by s.priority desc, s.updated_at asc
    limit $1
    `,
    [locationLimit]
  );

  if (!locations) {
    return {
      skipped: true,
      serviceAreasChecked: 0,
      alertsMatched,
      demandSignalsCorroborated,
      recommendationsPrepared,
      failures: [{ serviceAreaId: "database", message: "Weather monitor storage is not available." }],
      elapsedMs: Date.now() - started
    };
  }

  const requestCache = new Map<string, Promise<NwsAlertFeature[]>>();
  const evidenceCache = new Map<string, Promise<Awaited<ReturnType<typeof leadEvidence>>>>();
  const pushPreferenceCache = new Map<string, ReturnType<typeof getPushNotificationPreferences>>();
  const fetchAlerts = (url: string) => {
    const existing = requestCache.get(url);
    if (existing) return existing;
    const pending = fetchImpl(url, {
      headers: {
        Accept: "application/geo+json",
        "User-Agent": "Ferocity/1.0 (https://ferocity.live/contact)"
      },
      signal: AbortSignal.timeout(10_000)
    }).then(async (response) => {
      if (!response.ok) throw new Error(`NWS request failed with ${response.status}`);
      const payload = await response.json() as NwsAlertCollection;
      return Array.isArray(payload.features) ? payload.features : [];
    });
    requestCache.set(url, pending);
    return pending;
  };

  await mapConcurrent(locations.rows, boundedConcurrency(options.concurrency), async (area) => {
    try {
      const scope = nwsUrl(area);
      if (!scope) return;
      const features = await fetchAlerts(scope.url);
      const alerts = features
        .map(normalizeNwsAlert)
        .filter((alert): alert is NormalizedWeatherAlert => Boolean(alert))
        .filter((alert) => scope.pointScoped || alertMatchesTextServiceArea(alert.areaDescription, area.city ?? "", area.name));
      if (alerts.length === 0) return;

      const evidenceKey = `${area.tenant_id}:${area.brand_id}`;
      const evidencePromise = evidenceCache.get(evidenceKey) ?? leadEvidence(area.tenant_id, area.brand_id);
      evidenceCache.set(evidenceKey, evidencePromise);
      const evidence = await evidencePromise;

      const rankedAlerts = alerts.sort((left, right) => right.serviceRelevanceScore - left.serviceRelevanceScore);
      for (const [alertIndex, alert] of rankedAlerts.entries()) {
        alertsMatched += 1;
        const classification = classifyWeatherDemand({ alert, ...evidence });
        const signal = await upsertSignal({ area, alert, classification });
        if (!signal) throw new Error("Weather signal could not be stored.");
        if (classification.demandCorroborated) demandSignalsCorroborated += 1;
        if (alertIndex === 0) {
          const recommendationStored = await upsertRecommendation({ area, alert, classification, signalId: signal.id });
          if (recommendationStored) recommendationsPrepared += 1;

          if (!signal.pushNotifiedAt || signal.pushNotificationClaim !== classification.evidence.claimAllowed) {
            const existingPreferences = pushPreferenceCache.get(area.tenant_id);
            const preferences = existingPreferences ?? getPushNotificationPreferences(area.tenant_id);
            pushPreferenceCache.set(area.tenant_id, preferences);
            const pushAllowed = pushPreferencesAllowEvent({
              preferences: await preferences,
              severity: classification.demandCorroborated ? "high" : "medium",
              status: "active",
              ownerAttention: true,
              moneyCents: 0,
              riskType: "revenue"
            });
            if (pushAllowed) {
              const place = area.name || area.city || alert.areaDescription || "the service area";
              const push = await sendWorkspacePushNotifications({
                tenantId: area.tenant_id,
                eventType: "weather_growth_opportunity",
                title: classification.demandCorroborated
                  ? `Storm-related demand is rising in ${place}`
                  : `Severe weather opportunity in ${place}`,
                body: classification.demandCorroborated
                  ? `A verified ${alert.eventName} overlaps the area and incoming storm leads are above baseline. Ferocity prepared the next move.`
                  : `A verified ${alert.eventName} overlaps the area. Ferocity prepared a review-ready opportunity without claiming demand has increased.`,
                url: "/app/marketing-os",
                tag: `weather-opportunity-${signal.id}`,
                metadata: {
                  weatherSignalId: signal.id,
                  serviceAreaTargetId: area.id,
                  claimAllowed: classification.evidence.claimAllowed
                }
              });
              if (push.sent > 0) {
                await queryPostgres(
                  "update public.weather_demand_signals set push_notified_at = now(), push_notification_claim = $2, updated_at = now() where id = $1",
                  [signal.id, classification.evidence.claimAllowed]
                );
              }
            }
          }
        }
      }
    } catch (error) {
      failures.push({
        serviceAreaId: area.id,
        message: error instanceof Error ? error.message : "Unknown weather-monitor failure"
      });
    }
  });

  return {
    skipped: false,
    serviceAreasChecked: locations.rows.length,
    alertsMatched,
    demandSignalsCorroborated,
    recommendationsPrepared,
    failures,
    elapsedMs: Date.now() - started
  };
}
