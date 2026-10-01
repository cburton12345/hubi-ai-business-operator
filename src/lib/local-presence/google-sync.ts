import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { evaluateLocalPresence, reviewDecision, type LocalBusinessRecord } from "./engine";
import { googleBusinessProfileLocalAdapter } from "./provider";

type SelectedLocation = {
  id: string;
  connection_id: string;
  external_account_name: string;
  external_location_name: string;
  title: string;
  website_uri: string | null;
  primary_phone: string | null;
  address_text: string | null;
  primary_category: string | null;
  verification_state: string | null;
  metadata_json: Record<string, unknown> | null;
  updated_at: Date;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function month(date: Date) {
  return date.toISOString().slice(0, 7);
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function providerServiceLabels(value: unknown) {
  return asArray(value).map((item) => {
    const row = asObject(item);
    const freeForm = asObject(row.freeFormServiceItem);
    const structured = asObject(row.structuredServiceItem);
    return String(freeForm.label ?? structured.description ?? structured.serviceTypeId ?? "").trim();
  }).filter(Boolean);
}

function providerServiceAreaLabels(value: unknown) {
  const places = asObject(asObject(value).places);
  return asArray(places.placeInfos).map((item) => {
    const row = asObject(item);
    return String(row.placeName ?? row.placeId ?? "").trim();
  }).filter(Boolean);
}

export async function syncGoogleLocalPresence(tenantId: string, fetchImpl: typeof fetch = fetch) {
  const [locationResult, brandResult] = await Promise.all([
    queryPostgres<SelectedLocation>(
      `select id,connection_id,external_account_name,external_location_name,title,website_uri,primary_phone,address_text,
              primary_category,verification_state,metadata_json,updated_at
       from public.business_profile_locations where tenant_id=$1 and selected=true limit 1`,
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string; description: string | null; phone: string | null; domain: string | null; primary_location: string | null }>(
      `select id,name,description,phone,domain,primary_location from public.brands where tenant_id=$1 and status='active' order by created_at limit 1`,
      [tenantId]
    )
  ]);
  const location = locationResult?.rows[0];
  const brand = brandResult?.rows[0];
  if (!location || !brand) throw new Error("Select a Google Business Profile location and active Ferocity brand first.");

  const accessToken = await getFreshProviderAccessToken(tenantId, "google_business_profile", fetchImpl);
  const context = { accessToken, accountName: location.external_account_name, locationName: location.external_location_name, fetchImpl };
  let liveAttributes = asObject(location.metadata_json?.attributes);
  let liveMediaCount = typeof location.metadata_json?.mediaCount === "number" ? location.metadata_json.mediaCount : 0;
  try {
    const [attributes, media] = await Promise.all([
      googleBusinessProfileLocalAdapter.getAttributes(context),
      googleBusinessProfileLocalAdapter.getMedia(context)
    ]);
    liveAttributes = asObject(attributes.attributes ?? attributes);
    liveMediaCount = media.length;
    await queryPostgres(
      `update public.business_profile_locations set metadata_json=metadata_json || $3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, location.id, JSON.stringify({ attributes: liveAttributes, mediaCount: liveMediaCount })]
    );
  } catch {
    // Profile health can still be calculated from the last known provider snapshot.
  }

  const [servicesResult, areasResult, policyResult, phoneResult] = await Promise.all([
    queryPostgres<{ name: string }>(`select name from public.brand_services where tenant_id=$1 and brand_id=$2 and active=true order by priority desc,name`, [tenantId, brand.id]),
    queryPostgres<{ label: string }>(`select concat_ws(', ',nullif(service_area_name,''),nullif(city,''),nullif(state,'')) as label from public.brand_locations where tenant_id=$1 and brand_id=$2 and active=true order by priority desc`, [tenantId, brand.id]),
    queryPostgres<{ id: string; stale_after_days: number; use_tracked_phone_when_appropriate: boolean; positive_reply_opt_in: boolean; positive_reply_min_stars: number; negative_review_threshold: number; negative_review_route: "owner" | "service_recovery" | "approval_queue" }>(
      `select id,stale_after_days,use_tracked_phone_when_appropriate,positive_reply_opt_in,positive_reply_min_stars,negative_review_threshold,negative_review_route
       from public.local_presence_policies where tenant_id=$1 and brand_id=$2 and provider_key='google_business_profile' limit 1`, [tenantId, brand.id]
    ),
    queryPostgres<{ phone_number: string }>(
      `select phone_number from public.tenant_phone_numbers where tenant_id=$1 and status='active' and voice_enabled=true
       order by (number_mode='ferocity_managed') desc,created_at desc limit 1`, [tenantId]
    )
  ]);
  const policy = policyResult?.rows[0];
  const trackedPhone = policy?.use_tracked_phone_when_appropriate ? phoneResult?.rows[0]?.phone_number : null;
  const profile = asObject(location.metadata_json?.profile);
  const provider: LocalBusinessRecord = {
    name: location.title,
    primaryCategory: location.primary_category,
    services: providerServiceLabels(profile.serviceItems),
    description: String(asObject(profile.profile).description ?? "") || null,
    regularHours: profile.regularHours,
    specialHours: profile.specialHours,
    serviceAreas: providerServiceAreaLabels(profile.serviceArea),
    phone: location.primary_phone,
    website: location.website_uri,
    address: location.address_text,
    attributes: liveAttributes,
    mediaCount: liveMediaCount,
    verified: location.verification_state === "verified",
    updatedAt: location.updated_at.toISOString()
  };
  const canonical: LocalBusinessRecord = {
    name: brand.name,
    primaryCategory: location.primary_category,
    services: (servicesResult?.rows ?? []).map((row) => row.name),
    description: brand.description,
    serviceAreas: (areasResult?.rows ?? []).map((row) => row.label).filter(Boolean),
    phone: trackedPhone ?? brand.phone,
    website: brand.domain ? (brand.domain.startsWith("http") ? brand.domain : `https://${brand.domain}`) : null,
    address: brand.primary_location,
    verified: true
  };
  const health = evaluateLocalPresence({ canonical, provider, staleAfterDays: policy?.stale_after_days ?? 45 });
  const profileResult = await queryPostgres<{ id: string }>(
    `insert into public.local_presence_profiles
      (tenant_id,brand_id,provider_key,provider_location_key,business_profile_location_id,display_name,status,
       profile_health_score,completeness_score,consistency_score,freshness_score,canonical_business_json,provider_snapshot_json,
       capability_snapshot_json,last_profile_sync_at,last_review_sync_at,metadata_json)
     values ($1,$2,'google_business_profile',$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,now(),now(),$14::jsonb)
     on conflict (tenant_id,provider_key,provider_location_key) do update set
       business_profile_location_id=excluded.business_profile_location_id,display_name=excluded.display_name,status=excluded.status,
       profile_health_score=excluded.profile_health_score,completeness_score=excluded.completeness_score,
       consistency_score=excluded.consistency_score,freshness_score=excluded.freshness_score,
       canonical_business_json=excluded.canonical_business_json,provider_snapshot_json=excluded.provider_snapshot_json,
       capability_snapshot_json=excluded.capability_snapshot_json,last_profile_sync_at=now(),last_review_sync_at=now(),metadata_json=excluded.metadata_json,updated_at=now()
     returning id`,
    [tenantId, brand.id, location.external_location_name, location.id, location.title,
      health.healthScore >= 80 ? "healthy" : "needs_attention", health.healthScore, health.completenessScore,
      health.consistencyScore, health.freshnessScore, JSON.stringify(canonical), JSON.stringify(provider),
      JSON.stringify({ adapter: "google_business_profile", reads: true, governedWrites: true, performance: true, searchQueries: true }),
      JSON.stringify({ trackedPhoneCandidate: trackedPhone ?? null, phoneChangeRequiresApproval: true })]
  );
  const profileId = profileResult?.rows[0]?.id;
  if (!profileId) throw new Error("Could not save the local presence profile.");

  const activeIssueKeys: string[] = [];
  for (const issue of health.issues) {
    activeIssueKeys.push(issue.key);
    await queryPostgres(
      `insert into public.local_presence_issues
        (tenant_id,profile_id,issue_key,field_key,issue_type,severity,status,title,explanation,current_value_json,recommended_value_json,safe_to_auto_fix,provider_action)
       values ($1,$2,$3,$4,$5,$6,'recommended',$7,$8,$9::jsonb,$10::jsonb,$11,$12)
       on conflict (profile_id,issue_key) do update set field_key=excluded.field_key,issue_type=excluded.issue_type,severity=excluded.severity,
         status=case when public.local_presence_issues.status='dismissed' then 'dismissed' else 'recommended' end,title=excluded.title,
         explanation=excluded.explanation,current_value_json=excluded.current_value_json,recommended_value_json=excluded.recommended_value_json,
         safe_to_auto_fix=excluded.safe_to_auto_fix,provider_action=excluded.provider_action,detected_at=now(),updated_at=now()`,
      [tenantId, profileId, issue.key, issue.field, issue.type, issue.severity, issue.title, issue.explanation,
        JSON.stringify(issue.currentValue), JSON.stringify(issue.recommendedValue), issue.safeToAutoFix, issue.providerAction ?? null]
    );
  }
  await queryPostgres(
    `update public.local_presence_issues set status='resolved',resolved_at=now(),updated_at=now()
     where tenant_id=$1 and profile_id=$2 and status not in ('resolved','dismissed') and not (issue_key=any($3::text[]))`,
    [tenantId, profileId, activeIssueKeys.length ? activeIssueKeys : ["__none__"]]
  );

  let metricCount = 0;
  let queryCount = 0;
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 86_400_000);
  try {
    const metrics = await googleBusinessProfileLocalAdapter.getPerformance(context, isoDate(start), isoDate(end));
    for (const metric of metrics) {
      await queryPostgres(
        `insert into public.local_presence_metrics (tenant_id,profile_id,provider_key,metric_key,metric_date,value,breakdown_json)
         values ($1,$2,'google_business_profile',$3,$4::date,$5,$6::jsonb)
         on conflict (profile_id,metric_key,metric_date,breakdown_json) do update set value=excluded.value,updated_at=now()`,
        [tenantId, profileId, metric.metric, metric.date, metric.value, JSON.stringify(metric.breakdown)]
      );
    }
    metricCount = metrics.length;
    const queries = await googleBusinessProfileLocalAdapter.getSearchQueries(context, month(start), month(end));
    for (const query of queries) {
      await queryPostgres(
        `insert into public.local_presence_search_queries
          (tenant_id,profile_id,provider_key,period_start,period_end,query_text,impressions_value,impressions_threshold)
         values ($1,$2,'google_business_profile',date_trunc('month',$3::date)::date,$4::date,$5,$6,$7)
         on conflict (profile_id,period_start,period_end,query_text) do update set impressions_value=excluded.impressions_value,impressions_threshold=excluded.impressions_threshold,updated_at=now()`,
        [tenantId, profileId, isoDate(start), isoDate(end), query.query, query.value, query.threshold]
      );
    }
    queryCount = queries.length;
    await queryPostgres(`update public.local_presence_profiles set last_performance_sync_at=now(),updated_at=now() where id=$1 and tenant_id=$2`, [profileId, tenantId]);
  } catch (error) {
    await queryPostgres(
      `insert into public.local_presence_issues (tenant_id,profile_id,issue_key,field_key,issue_type,severity,status,title,explanation,metadata_json)
       values ($1,$2,'performance:sync','performance','performance','medium','open','Performance data needs attention',$3,$4::jsonb)
       on conflict (profile_id,issue_key) do update set status='open',explanation=excluded.explanation,metadata_json=excluded.metadata_json,detected_at=now(),updated_at=now()`,
      [tenantId, profileId, error instanceof Error ? error.message : "Google performance data could not be refreshed.", JSON.stringify({ retryable: true })]
    );
  }
  const reviewActions = await prepareGoogleReviewActions(tenantId, profileId, policy);
  return { profileId, ...health, metricCount, queryCount, reviewActions };
}

async function prepareGoogleReviewActions(tenantId: string, profileId: string, policy: {
  positive_reply_opt_in: boolean; positive_reply_min_stars: number; negative_review_threshold: number;
  negative_review_route: "owner" | "service_recovery" | "approval_queue";
} | undefined) {
  const reviews = await queryPostgres<{
    id: string; external_review_name: string; reviewer_name: string | null; star_rating: number | null;
    comment_text: string | null; reply_comment: string | null;
  }>(
    `select r.id,r.external_review_name,r.reviewer_name,r.star_rating,r.comment_text,r.reply_comment
     from public.business_profile_reviews r join public.local_presence_profiles p on p.business_profile_location_id=r.location_id
     where r.tenant_id=$1 and p.id=$2 order by r.review_created_at desc nulls last limit 100`, [tenantId, profileId]
  );
  let prepared = 0;
  for (const review of reviews?.rows ?? []) {
    const decision = reviewDecision({
      stars: review.star_rating, comment: review.comment_text, existingReply: review.reply_comment,
      positiveReplyOptIn: policy?.positive_reply_opt_in ?? false,
      positiveReplyMinStars: policy?.positive_reply_min_stars ?? 4,
      negativeThreshold: policy?.negative_review_threshold ?? 3
    });
    if (decision.action === "none") continue;
    const proposedReply = decision.action === "service_recovery" || decision.action === "owner_review" ? null : positiveReply(review.reviewer_name, review.external_review_name);
    const negativeRoute = policy?.negative_review_route ?? "owner";
    const actionType = decision.action === "service_recovery"
      ? negativeRoute === "service_recovery" ? "service_recovery" : negativeRoute === "approval_queue" ? "flag_for_review" : "route_owner"
      : decision.action === "owner_review" ? "route_owner" : "prepare_reply";
    const status = decision.action === "auto_reply_eligible" ? "approved" : "needs_approval";
    await queryPostgres(
      `insert into public.local_presence_review_actions
        (tenant_id,profile_id,business_profile_review_id,provider_review_key,action_type,status,proposed_reply,owner_opt_in_snapshot,risk_flags,idempotency_key,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       on conflict (tenant_id,idempotency_key) do nothing`,
      [tenantId, profileId, review.id, review.external_review_name, actionType, status, proposedReply,
        policy?.positive_reply_opt_in ?? false, decision.flags, `gbp-review:${review.external_review_name}:${review.reply_comment ? "replied" : "open"}`,
        JSON.stringify({ reason: decision.reason, liveProviderAction: false })]
    );
    prepared += 1;
  }
  return prepared;
}

export async function executeApprovedGoogleProfileIssue(tenantId: string, issueId: string, fetchImpl: typeof fetch = fetch) {
  const result = await queryPostgres<{
    id: string; status: string; field_key: string | null; recommended_value_json: unknown; safe_to_auto_fix: boolean;
    external_account_name: string; external_location_name: string;
  }>(
    `select i.id,i.status,i.field_key,i.recommended_value_json,i.safe_to_auto_fix,
            l.external_account_name,l.external_location_name
     from public.local_presence_issues i
     join public.local_presence_profiles p on p.id=i.profile_id and p.tenant_id=i.tenant_id
     join public.business_profile_locations l on l.id=p.business_profile_location_id and l.tenant_id=p.tenant_id
     where i.tenant_id=$1 and i.id=$2 limit 1`,
    [tenantId, issueId]
  );
  const issue = result?.rows[0];
  if (!issue || issue.status !== "approved" || !issue.safe_to_auto_fix) throw new Error("This profile update is not approved and safe to apply.");

  const field = issue.field_key;
  const recommendation = issue.recommended_value_json;
  const mutation = field === "description" && typeof recommendation === "string"
    ? { fields: ["profile"], patch: { profile: { description: recommendation } } }
    : field === "website" && typeof recommendation === "string"
      ? { fields: ["websiteUri"], patch: { websiteUri: recommendation } }
      : null;
  if (!mutation) throw new Error("This field still requires a reviewed provider-specific update.");

  await queryPostgres(`update public.local_presence_issues set status='queued',updated_at=now() where tenant_id=$1 and id=$2 and status='approved'`, [tenantId, issueId]);
  try {
    const accessToken = await getFreshProviderAccessToken(tenantId, "google_business_profile", fetchImpl);
    const response = await googleBusinessProfileLocalAdapter.updateProfile(
      { accessToken, accountName: issue.external_account_name, locationName: issue.external_location_name, fetchImpl },
      mutation.fields,
      mutation.patch
    );
    await queryPostgres(
      `update public.local_presence_issues set status='resolved',resolved_at=now(),metadata_json=metadata_json || $3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, issueId, JSON.stringify({ providerAppliedAt: new Date().toISOString() })]
    );
    return response;
  } catch (error) {
    await queryPostgres(
      `update public.local_presence_issues set status='needs_approval',metadata_json=metadata_json || $3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, issueId, JSON.stringify({ lastProviderError: error instanceof Error ? error.message : "Google profile update failed." })]
    );
    throw error;
  }
}

function positiveReply(name: string | null, seed: string) {
  const first = name?.trim().split(/\s+/)[0];
  const variants = [
    `Thank you${first ? `, ${first}` : ""}. We really appreciate you taking the time to share your experience.`,
    `We appreciate the thoughtful review${first ? `, ${first}` : ""}. Thank you for trusting our team.`,
    `Thank you for the kind feedback${first ? `, ${first}` : ""}. It means a lot to our team.`,
    `Thanks for sharing this${first ? `, ${first}` : ""}. We're glad you had a positive experience with us.`
  ];
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return variants[hash % variants.length];
}

export async function executeApprovedGoogleReviewReply(tenantId: string, actionId: string, fetchImpl: typeof fetch = fetch) {
  const result = await queryPostgres<{
    id: string; status: string; proposed_reply: string | null; provider_review_key: string;
    business_profile_review_id: string | null; approved_by_user_id: string | null; owner_opt_in_snapshot: boolean;
    external_account_name: string; external_location_name: string;
  }>(
    `select a.id,a.status,a.proposed_reply,a.provider_review_key,a.business_profile_review_id,a.approved_by_user_id,a.owner_opt_in_snapshot,
            l.external_account_name,l.external_location_name
     from public.local_presence_review_actions a
     join public.local_presence_profiles p on p.id=a.profile_id and p.tenant_id=a.tenant_id
     join public.business_profile_locations l on l.id=p.business_profile_location_id and l.tenant_id=p.tenant_id
     where a.tenant_id=$1 and a.id=$2 limit 1`, [tenantId, actionId]
  );
  const action = result?.rows[0];
  if (!action || action.status !== "approved" || !action.proposed_reply) throw new Error("This review reply is not approved and ready.");
  if (!action.owner_opt_in_snapshot && !action.approved_by_user_id) throw new Error("Owner opt-in or explicit human approval is required.");
  await queryPostgres(`update public.local_presence_review_actions set status='running',updated_at=now() where tenant_id=$1 and id=$2 and status='approved'`, [tenantId, actionId]);
  try {
    const accessToken = await getFreshProviderAccessToken(tenantId, "google_business_profile", fetchImpl);
    const response = await googleBusinessProfileLocalAdapter.replyToReview(
      { accessToken, accountName: action.external_account_name, locationName: action.external_location_name, fetchImpl },
      action.provider_review_key,
      action.proposed_reply
    );
    await queryPostgres(
      `update public.local_presence_review_actions set status='succeeded',provider_reference=$3,completed_at=now(),updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, actionId, action.provider_review_key]
    );
    if (action.business_profile_review_id) {
      await queryPostgres(`update public.business_profile_reviews set reply_comment=$3,reply_updated_at=now(),updated_at=now() where tenant_id=$1 and id=$2`, [tenantId, action.business_profile_review_id, action.proposed_reply]);
    }
    return response;
  } catch (error) {
    await queryPostgres(
      `update public.local_presence_review_actions set status='failed',failure_code='provider_error',failure_message=$3,updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, actionId, error instanceof Error ? error.message : "Google review reply failed."]
    );
    throw error;
  }
}
