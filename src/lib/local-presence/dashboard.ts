import { queryPostgres } from "@/lib/db/postgres";

export async function getLocalPresenceDashboard(tenantId: string) {
  const [profiles, issues, reviewActions, metrics, queries, events, policy] = await Promise.all([
    queryPostgres<{
      id: string; display_name: string; provider_key: string; status: string; profile_health_score: number;
      completeness_score: number; consistency_score: number; freshness_score: number; last_profile_sync_at: Date | null;
      last_review_sync_at: Date | null; last_performance_sync_at: Date | null;
    }>(`select id,display_name,provider_key,status,profile_health_score,completeness_score,consistency_score,freshness_score,last_profile_sync_at,last_review_sync_at,last_performance_sync_at from public.local_presence_profiles where tenant_id=$1 order by created_at`, [tenantId]),
    queryPostgres<{ id: string; severity: string; status: string; title: string; explanation: string | null; safe_to_auto_fix: boolean; provider_action: string | null; recommended_value_json: unknown }>(
      `select id,severity,status,title,explanation,safe_to_auto_fix,provider_action,recommended_value_json from public.local_presence_issues where tenant_id=$1 and status not in ('resolved','dismissed') order by case severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,detected_at desc limit 50`, [tenantId]
    ),
    queryPostgres<{ id: string; status: string; action_type: string; proposed_reply: string | null; reviewer_name: string | null; star_rating: number | null; comment_text: string | null }>(
      `select a.id,a.status,a.action_type,a.proposed_reply,r.reviewer_name,r.star_rating,r.comment_text
       from public.local_presence_review_actions a left join public.business_profile_reviews r on r.id=a.business_profile_review_id
       where a.tenant_id=$1 and a.status in ('draft','needs_approval','approved','failed') order by a.created_at desc limit 30`, [tenantId]
    ),
    queryPostgres<{ metric_key: string; total: string }>(
      `select metric_key,sum(value)::text as total from public.local_presence_metrics where tenant_id=$1 and metric_date>=current_date-interval '30 days' group by metric_key`, [tenantId]
    ),
    queryPostgres<{ query_text: string; impressions_value: string | null; impressions_threshold: string | null }>(
      `select query_text,impressions_value::text,impressions_threshold::text from public.local_presence_search_queries where tenant_id=$1 order by coalesce(impressions_value,impressions_threshold,0) desc,updated_at desc limit 20`, [tenantId]
    ),
    queryPostgres<{ id: string; event_type: string; status: string; occurred_at: Date; recommended_destinations: string[] }>(
      `select id,event_type,status,occurred_at,recommended_destinations from public.local_presence_events where tenant_id=$1 order by occurred_at desc limit 20`, [tenantId]
    ),
    queryPostgres<{
      id: string; brand_id: string; authority_mode: string; use_tracked_phone_when_appropriate: boolean; auto_prepare_posts: boolean;
      auto_request_reviews: boolean; positive_reply_opt_in: boolean; positive_reply_min_stars: number; negative_review_threshold: number;
      negative_review_route: string; stale_after_days: number;
    }>(`select id,brand_id,authority_mode,use_tracked_phone_when_appropriate,auto_prepare_posts,auto_request_reviews,positive_reply_opt_in,positive_reply_min_stars,negative_review_threshold,negative_review_route,stale_after_days from public.local_presence_policies where tenant_id=$1 and provider_key='google_business_profile' order by created_at limit 1`, [tenantId])
  ]);
  const metricMap = Object.fromEntries((metrics?.rows ?? []).map((row) => [row.metric_key, Number(row.total)]));
  return {
    profiles: profiles?.rows ?? [],
    issues: issues?.rows ?? [],
    reviewActions: reviewActions?.rows ?? [],
    metrics: metricMap,
    searchQueries: (queries?.rows ?? []).map((row) => ({ query: row.query_text, value: row.impressions_value == null ? null : Number(row.impressions_value), threshold: row.impressions_threshold == null ? null : Number(row.impressions_threshold) })),
    events: events?.rows ?? [],
    policy: policy?.rows[0] ?? null
  };
}
