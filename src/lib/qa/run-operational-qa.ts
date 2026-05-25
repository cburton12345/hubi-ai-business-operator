import { queryPostgres } from "@/lib/db/postgres";
import { ensurePlannedIntegrationConnections } from "@/lib/integrations/get-integrations";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type QaCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

function check(key: string, label: string, count: number, minimum = 1): QaCheck {
  return {
    key,
    label,
    passed: count >= minimum,
    detail: `${count} found; expected at least ${minimum}.`
  };
}

export async function runOperationalQa(userId?: string | null) {
  const workspaceId = await getCurrentWorkspaceId();
  await ensurePlannedIntegrationConnections();
  const result = await queryPostgres<{
    brands: string;
    forms: string;
    users: string;
    services: string;
    locations: string;
    keywords: string;
    beta_checks: string;
    settings: string;
    workflows: string;
    billing: string;
    integrations: string;
    live_integrations: string;
    integration_callbacks: string;
    provider_routes: string;
    live_provider_accounts: string;
    action_queue_items: string;
    marketplacepro_provider: string;
    marketplacepro_adapter_events: string;
    marketplacepro_mappings: string;
    health_query: string;
  }>(
    `
    select
      (select count(*) from public.brands where tenant_id = $1 and status <> 'archived') as brands,
      (select count(*) from public.forms where tenant_id = $1 and active = true) as forms,
      (select count(*) from public.tenant_users where tenant_id = $1 and status = 'active') as users,
      (select count(*) from public.brand_services where tenant_id = $1 and active = true) as services,
      (select count(*) from public.brand_locations where tenant_id = $1 and active = true) as locations,
      (select count(*) from public.brand_seo_keywords where tenant_id = $1) as keywords,
      (select count(*) from public.beta_launch_checks where tenant_id = $1) as beta_checks,
      (select count(*) from public.workspace_settings where tenant_id = $1) as settings,
      (select count(*) from public.business_workflow_configs where tenant_id = $1 and active = true) as workflows,
      (select count(*) from public.billing_subscriptions where tenant_id = $1) as billing,
      (select count(*) from public.integration_connections where tenant_id = $1) as integrations,
      (select count(*) from public.integration_connections where tenant_id = $1 and coalesce((metadata_json->>'liveActionsEnabled')::boolean, false) = true) as live_integrations,
      (select count(*) from public.integration_connections where tenant_id = $1 and metadata_json->>'callbackPath' is not null) as integration_callbacks,
      (select count(*) from public.provider_routing_rules where tenant_id = $1 and status = 'active') as provider_routes,
      (select count(*) from public.provider_accounts where tenant_id = $1 and live_actions_enabled = true) as live_provider_accounts,
      (select count(*) from public.outbound_action_queue where tenant_id = $1 and status in ('needs_review', 'approved', 'queued')) as action_queue_items,
      (select count(*) from public.provider_accounts where tenant_id = $1 and provider_key = 'marketplacepro') as marketplacepro_provider,
      (select count(*) from public.marketplacepro_sync_events where tenant_id = $1) as marketplacepro_adapter_events,
      (select count(*) from public.marketplacepro_connections where tenant_id = $1) as marketplacepro_mappings,
      (select count(*) from public.tenants where id = $1) as health_query
    `,
    [workspaceId]
  );
  const row = result?.rows[0];
  const checks = [
    check("brands", "Active brand exists", Number(row?.brands ?? 0)),
    check("forms", "Active lead form exists", Number(row?.forms ?? 0)),
    check("users", "Workspace users exist", Number(row?.users ?? 0)),
    check("services", "Brand services exist", Number(row?.services ?? 0)),
    check("locations", "Service areas exist", Number(row?.locations ?? 0)),
    check("keywords", "SEO keywords exist", Number(row?.keywords ?? 0)),
    check("beta-checks", "Beta checks exist", Number(row?.beta_checks ?? 0), 5),
    check("settings", "Workspace settings exist", Number(row?.settings ?? 0)),
    check("workflows", "Business workflows exist", Number(row?.workflows ?? 0)),
    check("billing", "Billing placeholder exists", Number(row?.billing ?? 0)),
    check("integrations", "Integration placeholders exist", Number(row?.integrations ?? 0), 3),
    {
      key: "live-integrations-disabled",
      label: "Live provider actions are disabled",
      passed: Number(row?.live_integrations ?? 0) === 0,
      detail: `${Number(row?.live_integrations ?? 0)} live provider connections enabled; expected 0 before keys and final approval.`
    },
    {
      key: "live-provider-accounts-disabled",
      label: "Live provider accounts are disabled",
      passed: Number(row?.live_provider_accounts ?? 0) === 0,
      detail: `${Number(row?.live_provider_accounts ?? 0)} live provider accounts enabled; expected 0 before provider keys and final approval.`
    },
    check("integration-callbacks", "Provider callback stubs exist", Number(row?.integration_callbacks ?? 0), 3),
    check("provider-routes", "Provider routing rules exist", Number(row?.provider_routes ?? 0), 5),
    {
      key: "action-queue-visible",
      label: "Action queue is ready",
      passed: Number(row?.action_queue_items ?? 0) >= 0,
      detail: `${Number(row?.action_queue_items ?? 0)} reviewed or pending actions found.`
    },
    check("marketplacepro-provider", "MarketplacePro provider record exists", Number(row?.marketplacepro_provider ?? 0)),
    {
      key: "marketplacepro-adapter-ready",
      label: "MarketplacePro adapter tables are ready",
      passed: Number(row?.marketplacepro_adapter_events ?? 0) >= 0 && Number(row?.marketplacepro_mappings ?? 0) >= 0,
      detail: `${Number(row?.marketplacepro_mappings ?? 0)} mappings and ${Number(row?.marketplacepro_adapter_events ?? 0)} sync events found. Zero is OK before live connection.`
    },
    check("health-query", "Supabase health query works", Number(row?.health_query ?? 0))
  ];
  const passed = checks.every((item) => item.passed);

  await queryPostgres(
    `
    insert into public.operational_qa_runs (tenant_id, status, checks_json, summary, created_by_user_id, completed_at)
    values ($1, $2, $3::jsonb, $4, $5, now())
    `,
    [workspaceId, passed ? "passed" : "failed", JSON.stringify(checks), passed ? "Operational QA passed." : "Operational QA has failures.", userId ?? null]
  );

  await queryPostgres(
    `
    update public.beta_launch_checks
    set status = $3, notes = $4, updated_at = now()
    where tenant_id = $1 and check_key = 'operational-qa-run'
    `,
    [workspaceId, "operational-qa-run", passed ? "passed" : "failed", passed ? "Latest operational QA passed." : "Latest operational QA has failures."]
  );

  return { passed, checks };
}
