import { queryPostgres } from "@/lib/db/postgres";

export type PlatformActivityItem = {
  id: string;
  title: string;
  detail: string;
  status: string;
  occurredAt: string;
  supportIssueId?: string;
  contact?: string | null;
  summary?: string | null;
};

export async function getPlatformActivity() {
  const [metrics, pages, sources, subscriptions, support] = await Promise.all([
    queryPostgres<{
      views_24h: string; views_7d: string; views_30d: string;
      checkout_started_30d: string; checkout_redirected_30d: string; paid_30d: string;
      activated_30d: string; at_risk: string; stalled_provisioning: string; failed_checkout_30d: string; abandoned_checkout_30d: string;
      active_plan_value_cents: string; at_risk_plan_value_cents: string;
      collected_month_cents: string; refunded_month_cents: string; net_collected_month_cents: string; payment_risk_cents: string;
      provider_cost_month_cents: string;
      open_support: string;
    }>(
      `with latest_customer_health as (
        select distinct on (snapshot.tenant_id)
          snapshot.tenant_id,snapshot.lifecycle_stage,snapshot.first_value_reached,snapshot.snapshot_date
        from public.customer_success_lifecycle_snapshots snapshot
        join public.tenants tenant on tenant.id=snapshot.tenant_id and tenant.account_type='customer'
        order by snapshot.tenant_id,snapshot.snapshot_date desc,snapshot.updated_at desc
      ), latest_subscription_invoice_state as (
        select distinct on (event.provider_object_id)
          event.provider_object_id,event.financial_status,event.gross_amount_cents
        from public.platform_subscription_revenue_events event
        where event.event_type <> 'subscription_refund'
        order by event.provider_object_id,event.occurred_at desc,event.created_at desc
      )
      select
        (select count(*) from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '24 hours')::text views_24h,
        (select count(*) from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '7 days')::text views_7d,
        (select count(*) from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '30 days')::text views_30d,
        (select count(*) from public.access_requests where request_type='paid_checkout' and created_at >= now()-interval '30 days')::text checkout_started_30d,
        (select count(*) from public.access_requests where request_type='paid_checkout' and metadata_json->>'checkoutStatus' in ('redirected','provisioning','paid_and_provisioned') and created_at >= now()-interval '30 days')::text checkout_redirected_30d,
        (select count(*) from public.access_requests where request_type='paid_checkout' and metadata_json->>'checkoutStatus'='paid_and_provisioned' and created_at >= now()-interval '30 days')::text paid_30d,
        (select count(*) from latest_customer_health health join public.tenants tenant on tenant.id=health.tenant_id where health.first_value_reached=true and tenant.created_at >= now()-interval '30 days')::text activated_30d,
        (select count(*) from latest_customer_health where lifecycle_stage='at_risk')::text at_risk,
        (select count(*) from public.access_requests where request_type='paid_checkout' and metadata_json->>'checkoutStatus'='provisioning' and updated_at < now()-interval '15 minutes')::text stalled_provisioning,
        (select count(*) from public.access_requests where request_type='paid_checkout' and metadata_json->>'checkoutStatus' in ('creating','checkout_failed') and created_at >= now()-interval '30 days')::text failed_checkout_30d,
        (select count(*) from public.access_requests where request_type='paid_checkout' and metadata_json->>'checkoutStatus'='redirected' and updated_at < now()-interval '1 hour' and created_at >= now()-interval '30 days')::text abandoned_checkout_30d,
        (select coalesce(sum(plan.monthly_price_cents),0) from public.billing_subscriptions subscription
          join public.tenants tenant on tenant.id=subscription.tenant_id and tenant.account_type='customer'
          join public.billing_plans plan on plan.plan_key=subscription.plan_key
          where subscription.status in ('active','trialing'))::text active_plan_value_cents,
        (select coalesce(sum(plan.monthly_price_cents),0) from public.billing_subscriptions subscription
          join public.tenants tenant on tenant.id=subscription.tenant_id and tenant.account_type='customer'
          join public.billing_plans plan on plan.plan_key=subscription.plan_key
          where subscription.status='past_due')::text at_risk_plan_value_cents,
        (select coalesce(sum(gross_amount_cents),0) from public.platform_subscription_revenue_events
          where financial_status='collected' and occurred_at >= date_trunc('month',now()))::text collected_month_cents,
        (select coalesce(sum(refund_amount_cents),0) from public.platform_subscription_revenue_events
          where financial_status='refunded' and occurred_at >= date_trunc('month',now()))::text refunded_month_cents,
        (select coalesce(sum(net_amount_cents),0) from public.platform_subscription_revenue_events
          where occurred_at >= date_trunc('month',now()))::text net_collected_month_cents,
        (select coalesce(sum(gross_amount_cents),0) from latest_subscription_invoice_state
          where financial_status='at_risk')::text payment_risk_cents,
        (select coalesce(sum(provider_cost_cents),0) from public.usage_meter_events
          where billing_period_start=date_trunc('month',now())::date and status not in ('void','failed'))::text provider_cost_month_cents,
        (select count(*) from public.support_issue_queue where status in ('open','reviewing'))::text open_support`
    ),
    queryPostgres<{ path: string; views: string }>(
      `select path, count(*)::text views from public.public_site_events
       where event_type='page_view' and occurred_at >= now()-interval '30 days'
       group by path order by count(*) desc limit 10`
    ),
    queryPostgres<{ source: string; views: string }>(
      `select coalesce(nullif(campaign_source,''), nullif(referrer_host,''), 'direct') source, count(*)::text views
       from public.public_site_events where event_type='page_view' and occurred_at >= now()-interval '30 days'
       group by 1 order by count(*) desc limit 10`
    ),
    queryPostgres<{ id: string; company_name: string | null; email: string; requested_plan: string | null; checkout_status: string; created_at: Date }>(
      `select id, company_name, email, requested_plan,
         coalesce(metadata_json->>'checkoutStatus',status) as checkout_status, created_at
       from public.access_requests where request_type='paid_checkout'
       order by created_at desc limit 12`
    ),
    queryPostgres<{ id: string; requester_name: string | null; requester_email: string | null; requester_phone: string | null; subject: string | null; message: string; issue_type: string; status: string; created_at: Date }>(
      `select id, requester_name, requester_email, requester_phone, subject, message, issue_type, status, created_at
       from public.support_issue_queue order by created_at desc limit 12`
    )
  ]);
  const row = metrics?.rows[0];
  return {
    metrics: {
      views24h: Number(row?.views_24h ?? 0),
      views7d: Number(row?.views_7d ?? 0),
      views30d: Number(row?.views_30d ?? 0),
      checkoutStarted30d: Number(row?.checkout_started_30d ?? 0),
      checkoutRedirected30d: Number(row?.checkout_redirected_30d ?? 0),
      paid30d: Number(row?.paid_30d ?? 0),
      activated30d: Number(row?.activated_30d ?? 0),
      atRisk: Number(row?.at_risk ?? 0),
      stalledProvisioning: Number(row?.stalled_provisioning ?? 0),
      failedCheckout30d: Number(row?.failed_checkout_30d ?? 0),
      abandonedCheckout30d: Number(row?.abandoned_checkout_30d ?? 0),
      activePlanValueCents: Number(row?.active_plan_value_cents ?? 0),
      atRiskPlanValueCents: Number(row?.at_risk_plan_value_cents ?? 0),
      collectedMonthCents: Number(row?.collected_month_cents ?? 0),
      refundedMonthCents: Number(row?.refunded_month_cents ?? 0),
      netCollectedMonthCents: Number(row?.net_collected_month_cents ?? 0),
      paymentRiskCents: Number(row?.payment_risk_cents ?? 0),
      providerCostMonthCents: Number(row?.provider_cost_month_cents ?? 0),
      openSupport: Number(row?.open_support ?? 0)
    },
    pages: (pages?.rows ?? []).map((item) => ({ label: item.path, value: Number(item.views) })),
    sources: (sources?.rows ?? []).map((item) => ({ label: item.source, value: Number(item.views) })),
    subscriptions: (subscriptions?.rows ?? []).map((item): PlatformActivityItem => ({
      id: item.id,
      title: item.company_name || item.email,
      detail: `${item.email} · ${item.requested_plan || "plan not recorded"}`,
      status: item.checkout_status,
      occurredAt: item.created_at.toISOString()
    })),
    support: (support?.rows ?? []).map((item): PlatformActivityItem => ({
      id: item.id,
      title: item.subject || "Support request",
      detail: `${item.requester_name || item.requester_email || "Customer"} · ${item.issue_type}`,
      status: item.status,
      occurredAt: item.created_at.toISOString(),
      supportIssueId: item.id,
      contact: item.requester_email || item.requester_phone,
      summary: item.message.slice(0, 500)
    }))
  };
}
