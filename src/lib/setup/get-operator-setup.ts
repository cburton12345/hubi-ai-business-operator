import { missingEnvVars } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type SetupStepRow = {
  id: string;
  stepKey: string;
  label: string;
  goal: string;
  href: string | null;
  status: string;
  providerKey: string | null;
  requiresProvider: boolean;
  minimumPlanKey: string;
  automationLevel: string;
};

export type SetupVerticalRow = {
  key: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  minimumPlanKey: string;
  steps: SetupStepRow[];
};

export type ProviderSetupRow = {
  providerKey: string;
  label: string;
  goal: string;
  envVars: string[];
  missingEnvVars: string[];
  callbackPath: string | null;
  riskLevel: string;
  liveActionRule: string;
};

export type PlanFeatureRow = {
  planKey: string;
  planName: string;
  monthlyPriceCents: number;
  featureLabel: string;
  limitLabel: string | null;
  sortOrder: number;
};

export type OperatorSetupDashboard = {
  verticals: SetupVerticalRow[];
  providers: ProviderSetupRow[];
  planFeatures: PlanFeatureRow[];
};

export async function getOperatorSetupDashboard(): Promise<OperatorSetupDashboard> {
  const workspaceId = await getCurrentWorkspaceId();

  const [verticalResult, stepResult, providerResult, planResult] = await Promise.all([
    queryPostgres<{
      vertical_key: string;
      name: string;
      simple_description: string;
      minimum_plan_key: string;
      workspace_status: string | null;
      priority: string | null;
      sort_order: number;
    }>(
      `
      select v.vertical_key, v.name, v.simple_description, v.minimum_plan_key,
        s.status as workspace_status, s.priority, v.sort_order
      from public.operator_verticals v
      left join public.workspace_vertical_status s on s.vertical_key = v.vertical_key and s.tenant_id = $1
      where v.status = 'available'
      order by v.sort_order asc
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      vertical_key: string;
      step_key: string;
      label: string;
      plain_language_goal: string;
      app_href: string | null;
      provider_key: string | null;
      requires_provider: boolean;
      minimum_plan_key: string;
      automation_level: string;
      status: string | null;
      sort_order: number;
    }>(
      `
      select st.id, st.vertical_key, st.step_key, st.label, st.plain_language_goal, st.app_href,
        st.provider_key, st.requires_provider, st.minimum_plan_key, st.automation_level, ws.status, st.sort_order
      from public.operator_vertical_steps st
      left join public.workspace_step_status ws
        on ws.tenant_id = $1 and ws.vertical_key = st.vertical_key and ws.step_key = st.step_key
      order by st.vertical_key, st.sort_order asc
      `,
      [workspaceId]
    ),
    queryPostgres<{
      provider_key: string;
      label: string;
      plain_language_goal: string;
      env_vars: string[];
      callback_path: string | null;
      risk_level: string;
      live_action_rule: string;
      sort_order: number;
    }>(
      `
      select provider_key, label, plain_language_goal, env_vars, callback_path, risk_level, live_action_rule, sort_order
      from public.provider_setup_steps
      order by sort_order asc
      `,
      []
    ),
    queryPostgres<{
      plan_key: string;
      plan_name: string;
      monthly_price_cents: number;
      feature_label: string;
      limit_label: string | null;
      sort_order: number;
    }>(
      `
      select f.plan_key, p.name as plan_name, p.monthly_price_cents, f.feature_label, f.limit_label, f.sort_order
      from public.plan_feature_matrix f
      join public.billing_plans p on p.plan_key = f.plan_key
      where p.active = true and f.included = true
      order by p.monthly_price_cents asc, f.sort_order asc
      `,
      []
    )
  ]);

  const steps = stepResult?.rows ?? [];

  return {
    verticals: (verticalResult?.rows ?? []).map((vertical) => ({
      key: vertical.vertical_key,
      name: vertical.name,
      description: vertical.simple_description,
      status: vertical.workspace_status ?? "not_started",
      priority: vertical.priority ?? "normal",
      minimumPlanKey: vertical.minimum_plan_key,
      steps: steps
        .filter((step) => step.vertical_key === vertical.vertical_key)
        .map((step) => ({
          id: step.id,
          stepKey: step.step_key,
          label: step.label,
          goal: step.plain_language_goal,
          href: step.app_href,
          status: step.status ?? "not_started",
          providerKey: step.provider_key,
          requiresProvider: step.requires_provider,
          minimumPlanKey: step.minimum_plan_key,
          automationLevel: step.automation_level
        }))
    })),
    providers: (providerResult?.rows ?? []).map((provider) => ({
      providerKey: provider.provider_key,
      label: provider.label,
      goal: provider.plain_language_goal,
      envVars: provider.env_vars ?? [],
      missingEnvVars: missingEnvVars((provider.env_vars ?? []) as Parameters<typeof missingEnvVars>[0]),
      callbackPath: provider.callback_path,
      riskLevel: provider.risk_level,
      liveActionRule: provider.live_action_rule
    })),
    planFeatures: (planResult?.rows ?? []).map((feature) => ({
      planKey: feature.plan_key,
      planName: feature.plan_name,
      monthlyPriceCents: feature.monthly_price_cents,
      featureLabel: feature.feature_label,
      limitLabel: feature.limit_label,
      sortOrder: feature.sort_order
    }))
  };
}
