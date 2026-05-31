"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { buildSetupPlan, type SetupPlan } from "@/lib/setup/setup-planner";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type SetupActionState = {
  ok: boolean;
  error?: string;
  plan?: SetupPlan;
};

const requestSchema = z.object({
  request: z.string().trim().min(8).max(2000)
});

const RESTORABLE_TABLES = new Set([
  "brands",
  "brand_services",
  "brand_locations",
  "brand_marketing_settings",
  "forms",
  "communication_templates",
  "brand_landing_pages",
  "growth_sources",
  "follow_up_workflows",
  "review_request_workflows"
]);

export async function previewSetupPlanAction(_state: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const parsed = requestSchema.safeParse({ request: formData.get("request") });
  if (!parsed.success) {
    return { ok: false, error: "Tell Ferocity what kind of business or workflow you want to set up." };
  }

  return { ok: true, plan: buildSetupPlan(parsed.data.request) };
}

export async function applySetupPlanAction(_state: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const actor = await requirePermission("tenant:manage");
  const parsed = requestSchema.safeParse({ request: formData.get("request") });
  if (!parsed.success) {
    return { ok: false, error: "Tell Ferocity what should be applied." };
  }

  const workspaceId = await getCurrentWorkspaceId();
  const plan = buildSetupPlan(parsed.data.request);
  const runResult = await queryPostgres<{ id: string }>(
    `
    insert into public.setup_operator_runs (
      tenant_id, requested_by_user_id, request_text, template_key, status, plan_json, applied_at
    )
    values ($1, $2, $3, $4, 'applied', $5::jsonb, now())
    returning id
    `,
    [workspaceId, actor.userId === "admin-token" ? null : actor.userId, plan.request, plan.templateKey, JSON.stringify(plan)]
  );
  const runId = runResult?.rows[0]?.id ?? null;

  const rollback: unknown[] = [];

  for (const target of plan.verticalTargets) {
    const before = await getVerticalStatus(workspaceId, target.verticalKey);
    const after = {
      vertical_key: target.verticalKey,
      status: target.status,
      priority: target.priority,
      notes: `Setup operator: ${plan.templateName}`,
      metadata_json: {
        setupOperator: true,
        runId,
        templateKey: plan.templateKey,
        request: plan.request
      }
    };

    await queryPostgres(
      `
      insert into public.workspace_vertical_status (tenant_id, vertical_key, status, priority, notes, metadata_json, updated_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (tenant_id, vertical_key) do update
      set status = excluded.status,
          priority = excluded.priority,
          notes = excluded.notes,
          metadata_json = public.workspace_vertical_status.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, target.verticalKey, target.status, target.priority, after.notes, JSON.stringify(after.metadata_json)]
    );

    rollback.push({ targetTable: "workspace_vertical_status", targetKey: target.verticalKey, before, after });
    await logSetupChange(runId, workspaceId, "vertical_status", "workspace_vertical_status", target.verticalKey, before, after);

    for (const stepKey of target.stepKeys) {
      const stepBefore = await getStepStatus(workspaceId, target.verticalKey, stepKey);
      const stepAfter = {
        vertical_key: target.verticalKey,
        step_key: stepKey,
        status: "in_progress",
        notes: `Prepared by setup operator: ${plan.templateName}`,
        metadata_json: {
          setupOperator: true,
          runId,
          templateKey: plan.templateKey
        }
      };

      await queryPostgres(
        `
        insert into public.workspace_step_status (tenant_id, vertical_key, step_key, status, notes, updated_by_user_id, metadata_json, updated_at)
        values ($1, $2, $3, 'in_progress', $4, $5, $6::jsonb, now())
        on conflict (tenant_id, vertical_key, step_key) do update
        set status = case when public.workspace_step_status.status = 'done' then 'done' else excluded.status end,
            notes = excluded.notes,
            updated_by_user_id = excluded.updated_by_user_id,
            metadata_json = public.workspace_step_status.metadata_json || excluded.metadata_json,
            updated_at = now()
        `,
        [workspaceId, target.verticalKey, stepKey, stepAfter.notes, actor.userId === "admin-token" ? null : actor.userId, JSON.stringify(stepAfter.metadata_json)]
      );

      rollback.push({ targetTable: "workspace_step_status", targetKey: `${target.verticalKey}:${stepKey}`, before: stepBefore, after: stepAfter });
      await logSetupChange(runId, workspaceId, "step_status", "workspace_step_status", `${target.verticalKey}:${stepKey}`, stepBefore, stepAfter);
    }
  }

  for (const target of plan.serviceTargets) {
    const before = await getFeatureEntitlement(workspaceId, target.featureKey);
    const after = {
      feature_key: target.featureKey,
      status: target.status,
      usage_limit: target.usageLimit,
      usage_period: "monthly",
      metadata_json: {
        approvalMode: target.mode,
        overagePolicy: target.overagePolicy,
        setupOperator: true,
        runId,
        templateKey: plan.templateKey,
        plainRule: target.mode === "draft_only" ? "Prepare drafts only until a human approves live use." : "Queue work for review before live use."
      }
    };

    await queryPostgres(
      `
      insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json, updated_at)
      values ($1, $2, $3, $4, 'monthly', $5::jsonb, now())
      on conflict (tenant_id, feature_key) do update
      set status = excluded.status,
          usage_limit = excluded.usage_limit,
          usage_period = excluded.usage_period,
          metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, target.featureKey, target.status, target.usageLimit, JSON.stringify(after.metadata_json)]
    );

    rollback.push({ targetTable: "workspace_feature_entitlements", targetKey: target.featureKey, before, after });
    await logSetupChange(runId, workspaceId, "service_control", "workspace_feature_entitlements", target.featureKey, before, after);
  }

  await applySetupAssets(workspaceId, runId, plan, rollback);

  if (runId) {
    await queryPostgres(
      `
      update public.setup_operator_runs
      set rollback_json = $2::jsonb, updated_at = now()
      where id = $1
      `,
      [runId, JSON.stringify({ changes: rollback })]
    );
  }

  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'setup_plan_applied', $2, $3, $4::jsonb)
    `,
    [
      workspaceId,
      `Setup plan applied: ${plan.goal}`,
      plan.summary,
      JSON.stringify({
        planner: "deterministic_setup_operator_v1",
        reversible: "setup_operator_run_changes",
        setupRunId: runId,
        request: plan.request,
        templateKey: plan.templateKey,
        businessType: plan.businessType,
        goal: plan.goal,
        changes: plan.changes,
        verticalTargets: plan.verticalTargets,
        serviceTargets: plan.serviceTargets,
        assetTargets: plan.assetTargets,
        safeDefaults: plan.safeDefaults,
        blockedUntil: plan.blockedUntil
      })
    ]
  );

  revalidatePath("/app/build-system");
  revalidatePath("/app");
  revalidatePath("/app/setup");
  revalidatePath("/app/controls");
  revalidatePath("/app/reports");
  return { ok: true, plan };
}

export async function revertSetupRunAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return;

  const workspaceId = actor.workspace.id;
  const changes = await queryPostgres<{
    id: string;
    target_table: string;
    target_key: string;
    before_json: Record<string, unknown> | null;
  }>(
    `
    select id, target_table, target_key, before_json
    from public.setup_operator_run_changes
    where tenant_id = $1 and run_id = $2 and status = 'applied'
    order by created_at desc, id desc
    `,
    [workspaceId, runId]
  );

  for (const change of changes?.rows ?? []) {
    await restoreChange(workspaceId, change.target_table, change.target_key, change.before_json);
    await queryPostgres(
      `
      update public.setup_operator_run_changes
      set status = 'reverted', reverted_at = now()
      where id = $1
      `,
      [change.id]
    );
  }

  await queryPostgres(
    `
    update public.setup_operator_runs
    set status = 'reverted', reverted_at = now(), updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, runId]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'setup_plan_reverted', 'Setup plan reverted', 'Ferocity restored the saved setup snapshot for this run.', $2::jsonb)
    `,
    [workspaceId, JSON.stringify({ setupRunId: runId, revertedBy: actor.email })]
  );

  revalidatePath("/app/build-system");
  revalidatePath("/app/setup");
  revalidatePath("/app/controls");
  revalidatePath("/app/reports");
}

type SetupBrand = {
  id: string;
  name: string;
  slug: string;
};

async function applySetupAssets(workspaceId: string, runId: string | null, plan: SetupPlan, rollback: unknown[]) {
  if (plan.assetTargets.length === 0) return;

  const brand = await getOrCreateSetupBrand(workspaceId, runId, plan, rollback);
  await upsertMarketingSettings(workspaceId, runId, brand.id, plan, rollback);

  for (const asset of plan.assetTargets) {
    if (asset.assetType === "brand_profile" || asset.assetType === "marketing_settings") continue;

    if (asset.assetType === "service") {
      await upsertBrandService(workspaceId, runId, brand.id, asset.title, asset.summary, rollback);
    }
    if (asset.assetType === "service_area") {
      await upsertServiceArea(workspaceId, runId, brand.id, asset.title, asset.summary, rollback);
    }
    if (asset.assetType === "lead_form") {
      await upsertLeadForm(workspaceId, runId, brand.id, asset.title, rollback);
    }
    if (asset.assetType === "communication_template") {
      await upsertCommunicationTemplate(workspaceId, runId, brand.id, asset.title, plan, rollback);
    }
    if (asset.assetType === "landing_page") {
      await upsertLandingPage(workspaceId, runId, brand.id, asset.title, plan, rollback);
    }
    if (asset.assetType === "growth_source") {
      await upsertGrowthSource(workspaceId, runId, brand.id, asset.title, plan, rollback);
    }
    if (asset.assetType === "follow_up_workflow") {
      await upsertFollowUpWorkflow(workspaceId, runId, brand.id, asset.title, plan, rollback);
    }
    if (asset.assetType === "review_workflow") {
      await upsertReviewWorkflow(workspaceId, runId, brand.id, asset.title, plan, rollback);
    }
  }
}

async function getOrCreateSetupBrand(workspaceId: string, runId: string | null, plan: SetupPlan, rollback: unknown[]): Promise<SetupBrand> {
  const existing = await queryPostgres<SetupBrand>(
    `
    select id, name, slug
    from public.brands
    where tenant_id = $1 and status <> 'archived'
    order by created_at asc
    limit 1
    `,
    [workspaceId]
  );
  const found = existing?.rows[0];
  if (found) return found;

  const businessModel = plan.templateKey === "rental_operator" ? "rental" : plan.templateKey === "software_growth" ? "software" : "local_service";
  const baseName = `${plan.businessType} Draft Profile`;
  const slug = `setup-${slugify(plan.templateKey)}`;
  const afterResult = await queryPostgres<SetupBrand>(
    `
    insert into public.brands (
      tenant_id, name, slug, business_model, industry, vertical, description, primary_goal, primary_location, status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, 'Confirm service area', 'active')
    returning id, name, slug, business_model, industry, vertical, description, primary_goal, primary_location, status
    `,
    [
      workspaceId,
      baseName,
      slug,
      businessModel,
      plan.businessType,
      plan.templateKey,
      "Draft profile created by Ferocity setup. Edit business name, contact info, and service area before public use.",
      plan.goal
    ]
  );
  const after = afterResult?.rows[0];
  if (!after) throw new Error("Ferocity could not create the draft business profile.");

  rollback.push({ targetTable: "brands", targetKey: after.id, before: null, after });
  await logSetupChange(runId, workspaceId, "setup_asset", "brands", after.id, null, after);
  return after;
}

async function upsertMarketingSettings(workspaceId: string, runId: string | null, brandId: string, plan: SetupPlan, rollback: unknown[]) {
  const before = await getRowByIdOrNatural(
    "brand_marketing_settings",
    "select * from public.brand_marketing_settings where tenant_id = $1 and brand_id = $2 limit 1",
    [workspaceId, brandId]
  );
  const result = await queryPostgres(
    `
    insert into public.brand_marketing_settings (
      tenant_id, brand_id, target_customers, cta_goals, ad_goals, seo_targets, review_strategy,
      follow_up_strategy, tone_of_voice, approval_mode, auto_create_low_risk_drafts,
      auto_weekly_seo_posts, auto_gbp_post_drafts, auto_facebook_post_drafts, auto_review_request_drafts,
      auto_follow_up_drafts, auto_landing_page_suggestions, high_risk_approval_rules, updated_at
    )
    values (
      $1, $2, $3, 'Get qualified leads and make follow-up easy to approve.', 'Keep paid channels paused until budget and tracking are approved.',
      $4, 'Ask after completed work; intercept unhappy customers before public response.', 'Draft reminders for leads, estimates, invoices, and reviews.',
      'Clear, helpful, local, and not spammy.', 'manual', true, false, true, true, true, true, true,
      $5::jsonb, now()
    )
    on conflict (brand_id) do update
    set target_customers = excluded.target_customers,
        cta_goals = excluded.cta_goals,
        ad_goals = excluded.ad_goals,
        seo_targets = excluded.seo_targets,
        review_strategy = excluded.review_strategy,
        follow_up_strategy = excluded.follow_up_strategy,
        tone_of_voice = excluded.tone_of_voice,
        approval_mode = 'manual',
        auto_create_low_risk_drafts = true,
        auto_weekly_seo_posts = false,
        auto_gbp_post_drafts = true,
        auto_facebook_post_drafts = true,
        auto_review_request_drafts = true,
        auto_follow_up_drafts = true,
        auto_landing_page_suggestions = true,
        high_risk_approval_rules = excluded.high_risk_approval_rules,
        updated_at = now()
    returning *
    `,
    [
      workspaceId,
      brandId,
      plan.businessType,
      `${plan.businessType} content tied to real services, service areas, reviews, jobs, and lead source ROI.`,
      JSON.stringify({
        publishingLive: true,
        adBudgetChanges: true,
        publicReviewResponses: true,
        smsEmailSending: true,
        providerSync: true,
        generatedSeoPages: true
      })
    ]
  );
  const after = result?.rows[0] ?? null;
  if (!after) return;
  rollback.push({ targetTable: "brand_marketing_settings", targetKey: String(after.id), before, after });
  await logSetupChange(runId, workspaceId, "setup_asset", "brand_marketing_settings", String(after.id), before, after);
}

async function upsertBrandService(workspaceId: string, runId: string | null, brandId: string, title: string, summary: string, rollback: unknown[]) {
  const slug = slugify(title);
  const before = await getRowByIdOrNatural("brand_services", "select * from public.brand_services where tenant_id = $1 and brand_id = $2 and slug = $3 limit 1", [workspaceId, brandId, slug]);
  const result = await queryPostgres(
    `
    insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
    values ($1, $2, $3, $4, $5, 100, true)
    on conflict (brand_id, slug) do update
    set name = excluded.name,
        description = excluded.description,
        priority = greatest(public.brand_services.priority, excluded.priority),
        active = true
    returning *
    `,
    [workspaceId, brandId, title, slug, `${summary} Created as an editable setup service.`]
  );
  await logRowChange(runId, workspaceId, rollback, "brand_services", before, result?.rows[0] ?? null);
}

async function upsertServiceArea(workspaceId: string, runId: string | null, brandId: string, title: string, summary: string, rollback: unknown[]) {
  const name = title === "Primary service area" ? "Primary service area to confirm" : title;
  const before = await getRowByIdOrNatural(
    "brand_locations",
    "select * from public.brand_locations where tenant_id = $1 and brand_id = $2 and lower(coalesce(service_area_name, '')) = lower($3) limit 1",
    [workspaceId, brandId, name]
  );
  if (before) return;
  const result = await queryPostgres(
    `
    insert into public.brand_locations (tenant_id, brand_id, service_area_name, priority, active)
    values ($1, $2, $3, 100, true)
    returning *, $4::text as setup_note
    `,
    [workspaceId, brandId, name, summary]
  );
  await logRowChange(runId, workspaceId, rollback, "brand_locations", null, result?.rows[0] ?? null);
}

async function upsertLeadForm(workspaceId: string, runId: string | null, brandId: string, title: string, rollback: unknown[]) {
  const slug = slugify(title);
  const before = await getRowByIdOrNatural("forms", "select * from public.forms where tenant_id = $1 and brand_id = $2 and slug = $3 limit 1", [workspaceId, brandId, slug]);
  const result = await queryPostgres(
    `
    insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
    values ($1, $2, $3, $4, $5, true)
    on conflict (brand_id, slug) do update
    set name = excluded.name,
        active = true
    returning *
    `,
    [workspaceId, brandId, title, slug, `setup_${randomUUID()}`]
  );
  await logRowChange(runId, workspaceId, rollback, "forms", before, result?.rows[0] ?? null);
}

async function upsertCommunicationTemplate(workspaceId: string, runId: string | null, brandId: string, title: string, plan: SetupPlan, rollback: unknown[]) {
  const template = getTemplateDefinition(title, plan);
  const before = await getRowByIdOrNatural(
    "communication_templates",
    "select * from public.communication_templates where tenant_id = $1 and purpose = $2 and name = $3 limit 1",
    [workspaceId, template.purpose, title]
  );
  const result = await queryPostgres(
    `
    insert into public.communication_templates (tenant_id, brand_id, name, channel, purpose, subject, body, active, requires_approval, metadata_json)
    values ($1, $2, $3, $4, $5, $6, $7, true, true, $8::jsonb)
    on conflict (tenant_id, purpose, name) do update
    set brand_id = excluded.brand_id,
        channel = excluded.channel,
        subject = excluded.subject,
        body = excluded.body,
        active = true,
        requires_approval = true,
        metadata_json = public.communication_templates.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning *
    `,
    [workspaceId, brandId, title, template.channel, template.purpose, template.subject, template.body, JSON.stringify({ setupOperator: true, templateKey: plan.templateKey, reviewRequired: true })]
  );
  await logRowChange(runId, workspaceId, rollback, "communication_templates", before, result?.rows[0] ?? null);
}

async function upsertLandingPage(workspaceId: string, runId: string | null, brandId: string, title: string, plan: SetupPlan, rollback: unknown[]) {
  const slug = slugify(title);
  const before = await getRowByIdOrNatural("brand_landing_pages", "select * from public.brand_landing_pages where tenant_id = $1 and brand_id = $2 and slug = $3 limit 1", [workspaceId, brandId, slug]);
  const result = await queryPostgres(
    `
    insert into public.brand_landing_pages (tenant_id, brand_id, title, slug, page_type, primary_keyword, status, updated_at)
    values ($1, $2, $3, $4, 'service_page', $5, 'planned', now())
    on conflict (brand_id, slug) do update
    set title = excluded.title,
        primary_keyword = excluded.primary_keyword,
        status = case when public.brand_landing_pages.status = 'published' then public.brand_landing_pages.status else 'planned' end,
        updated_at = now()
    returning *
    `,
    [workspaceId, brandId, title, slug, `${title} ${plan.businessType}`]
  );
  await logRowChange(runId, workspaceId, rollback, "brand_landing_pages", before, result?.rows[0] ?? null);
}

async function upsertGrowthSource(workspaceId: string, runId: string | null, brandId: string, title: string, plan: SetupPlan, rollback: unknown[]) {
  const isPaid = title.toLowerCase().includes("paid");
  const sourceFamily = isPaid ? "paid" : title.toLowerCase().includes("review") ? "gbp" : "organic";
  const sourceName = isPaid ? "Paid campaign tracking" : "Organic local SEO";
  const campaignName = "Setup Baseline";
  const serviceFocus = plan.businessType;
  const cityFocus = "Service Area";
  const before = await getRowByIdOrNatural(
    "growth_sources",
    `
    select * from public.growth_sources
    where tenant_id = $1 and brand_id = $2 and source_family = $3 and source_name = $4 and campaign_name = $5 and service_focus = $6 and city_focus = $7
    limit 1
    `,
    [workspaceId, brandId, sourceFamily, sourceName, campaignName, serviceFocus, cityFocus]
  );
  const result = await queryPostgres(
    `
    insert into public.growth_sources (
      tenant_id, brand_id, source_family, source_name, campaign_name, service_focus, city_focus, tracking_code, status, metadata_json, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
    on conflict (tenant_id, brand_id, source_family, source_name, campaign_name, service_focus, city_focus) do update
    set status = excluded.status,
        tracking_code = excluded.tracking_code,
        metadata_json = public.growth_sources.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning *
    `,
    [
      workspaceId,
      brandId,
      sourceFamily,
      sourceName,
      campaignName,
      serviceFocus,
      cityFocus,
      `ferocity_setup_${slugify(sourceName)}`,
      isPaid ? "paused" : "active",
      JSON.stringify({ setupOperator: true, note: "Attribution placeholder only; no ad account or spend is connected." })
    ]
  );
  await logRowChange(runId, workspaceId, rollback, "growth_sources", before, result?.rows[0] ?? null);
}

async function upsertFollowUpWorkflow(workspaceId: string, runId: string | null, brandId: string, title: string, plan: SetupPlan, rollback: unknown[]) {
  const workflowType = title.toLowerCase().includes("invoice")
    ? "invoice_followup"
    : title.toLowerCase().includes("estimate")
      ? "estimate_followup"
      : "stale_lead_recovery";
  const setupKey = `setup:${workflowType}:${plan.templateKey}`;
  const before = await getRowByIdOrNatural(
    "follow_up_workflows",
    "select * from public.follow_up_workflows where tenant_id = $1 and brand_id = $2 and metadata_json->>'setupKey' = $3 limit 1",
    [workspaceId, brandId, setupKey]
  );
  if (before) return;
  const result = await queryPostgres(
    `
    insert into public.follow_up_workflows (tenant_id, brand_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json)
    values ($1, $2, $3, 'manual', 'open', now() + interval '1 day', $4, $5::jsonb)
    returning *
    `,
    [
      workspaceId,
      brandId,
      workflowType,
      getFollowUpMessage(workflowType),
      JSON.stringify({ setupOperator: true, setupKey, reviewRequired: true, noAutoSend: true })
    ]
  );
  await logRowChange(runId, workspaceId, rollback, "follow_up_workflows", null, result?.rows[0] ?? null);
}

async function upsertReviewWorkflow(workspaceId: string, runId: string | null, brandId: string, title: string, plan: SetupPlan, rollback: unknown[]) {
  const setupKey = `setup:review_request:${plan.templateKey}`;
  const before = await getRowByIdOrNatural(
    "review_request_workflows",
    "select * from public.review_request_workflows where tenant_id = $1 and brand_id = $2 and metadata_json->>'setupKey' = $3 limit 1",
    [workspaceId, brandId, setupKey]
  );
  if (before) return;
  const result = await queryPostgres(
    `
    insert into public.review_request_workflows (
      tenant_id, brand_id, trigger_event, channel, status, negative_interception_status, ai_response_draft, metadata_json
    )
    values ($1, $2, 'job_completed', 'manual', 'draft', 'needs_service_recovery', $3, $4::jsonb)
    returning *
    `,
    [
      workspaceId,
      brandId,
      "Draft a short, personal review request after the customer confirms the job went well. Do not send automatically.",
      JSON.stringify({ setupOperator: true, setupKey, reviewRequired: true, noAutoSend: true, title })
    ]
  );
  await logRowChange(runId, workspaceId, rollback, "review_request_workflows", null, result?.rows[0] ?? null);
}

async function getVerticalStatus(workspaceId: string, verticalKey: string) {
  const result = await queryPostgres(
    `
    select vertical_key, status, priority, notes, metadata_json
    from public.workspace_vertical_status
    where tenant_id = $1 and vertical_key = $2
    limit 1
    `,
    [workspaceId, verticalKey]
  );
  return result?.rows[0] ?? null;
}

async function getStepStatus(workspaceId: string, verticalKey: string, stepKey: string) {
  const result = await queryPostgres(
    `
    select vertical_key, step_key, status, notes, metadata_json
    from public.workspace_step_status
    where tenant_id = $1 and vertical_key = $2 and step_key = $3
    limit 1
    `,
    [workspaceId, verticalKey, stepKey]
  );
  return result?.rows[0] ?? null;
}

async function getFeatureEntitlement(workspaceId: string, featureKey: string) {
  const result = await queryPostgres(
    `
    select feature_key, status, usage_limit, usage_period, metadata_json
    from public.workspace_feature_entitlements
    where tenant_id = $1 and feature_key = $2
    limit 1
    `,
    [workspaceId, featureKey]
  );
  return result?.rows[0] ?? null;
}

async function getRowByIdOrNatural(tableName: string, sql: string, params: unknown[]) {
  if (!RESTORABLE_TABLES.has(tableName)) throw new Error("Unsupported setup table.");
  const result = await queryPostgres(sql, params);
  return result?.rows[0] ?? null;
}

async function logRowChange(
  runId: string | null,
  workspaceId: string,
  rollback: unknown[],
  targetTable: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
) {
  if (!after?.id) return;
  const targetKey = String(after.id);
  rollback.push({ targetTable, targetKey, before, after });
  await logSetupChange(runId, workspaceId, "setup_asset", targetTable, targetKey, before, after);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "setup-item";
}

function getTemplateDefinition(title: string, plan: SetupPlan) {
  const lower = title.toLowerCase();
  if (lower.includes("review")) {
    return {
      channel: "email",
      purpose: "review_request",
      subject: "How did we do?",
      body: "Hi {{customer_name}}, thanks for choosing us. If everything went well, would you be open to leaving a quick review? Please review and approve this message before sending."
    };
  }
  if (lower.includes("estimate")) {
    return {
      channel: "email",
      purpose: "estimate_followup",
      subject: "Following up on your estimate",
      body: "Hi {{customer_name}}, I wanted to check if you had any questions about the estimate. Reply here and we can help with next steps."
    };
  }
  if (lower.includes("invoice")) {
    return {
      channel: "email",
      purpose: "invoice_followup",
      subject: "Quick invoice follow-up",
      body: "Hi {{customer_name}}, this is a quick follow-up on the open invoice. Let us know if you need anything from us before payment."
    };
  }
  return {
    channel: "sms",
    purpose: "new_lead_response",
    subject: null,
    body: `Hi {{customer_name}}, thanks for reaching out about ${plan.businessType.toLowerCase()}. We saw your request and will follow up shortly. Please review and approve before sending.`
  };
}

function getFollowUpMessage(workflowType: string) {
  if (workflowType === "invoice_followup") return "Review the invoice, confirm it is accurate, then send a polite payment reminder if appropriate.";
  if (workflowType === "estimate_followup") return "Review the estimate and ask whether the customer has questions or wants to schedule the work.";
  return "Review the lead history, check consent/source, then send a useful follow-up or make a callback.";
}

async function logSetupChange(
  runId: string | null,
  workspaceId: string,
  changeType: string,
  targetTable: string,
  targetKey: string,
  before: unknown,
  after: unknown
) {
  if (!runId) return;
  await queryPostgres(
    `
    insert into public.setup_operator_run_changes (
      run_id, tenant_id, change_type, target_table, target_key, status, before_json, after_json, applied_at
    )
    values ($1, $2, $3, $4, $5, 'applied', $6::jsonb, $7::jsonb, now())
    `,
    [runId, workspaceId, changeType, targetTable, targetKey, JSON.stringify(before), JSON.stringify(after)]
  );
}

async function restoreChange(workspaceId: string, targetTable: string, targetKey: string, before: Record<string, unknown> | null) {
  if (targetTable === "workspace_vertical_status") {
    if (!before) {
      await queryPostgres("delete from public.workspace_vertical_status where tenant_id = $1 and vertical_key = $2", [workspaceId, targetKey]);
      return;
    }
    await queryPostgres(
      `
      insert into public.workspace_vertical_status (tenant_id, vertical_key, status, priority, notes, metadata_json, updated_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (tenant_id, vertical_key) do update
      set status = excluded.status,
          priority = excluded.priority,
          notes = excluded.notes,
          metadata_json = excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, targetKey, before.status, before.priority, before.notes, JSON.stringify(before.metadata_json ?? {})]
    );
    return;
  }

  if (targetTable === "workspace_step_status") {
    const [verticalKey, stepKey] = targetKey.split(":");
    if (!before) {
      await queryPostgres("delete from public.workspace_step_status where tenant_id = $1 and vertical_key = $2 and step_key = $3", [workspaceId, verticalKey, stepKey]);
      return;
    }
    await queryPostgres(
      `
      insert into public.workspace_step_status (tenant_id, vertical_key, step_key, status, notes, metadata_json, updated_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (tenant_id, vertical_key, step_key) do update
      set status = excluded.status,
          notes = excluded.notes,
          metadata_json = excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, verticalKey, stepKey, before.status, before.notes, JSON.stringify(before.metadata_json ?? {})]
    );
    return;
  }

  if (targetTable === "workspace_feature_entitlements") {
    if (!before) {
      await queryPostgres("delete from public.workspace_feature_entitlements where tenant_id = $1 and feature_key = $2", [workspaceId, targetKey]);
      return;
    }
    await queryPostgres(
      `
      insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json, updated_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (tenant_id, feature_key) do update
      set status = excluded.status,
          usage_limit = excluded.usage_limit,
          usage_period = excluded.usage_period,
          metadata_json = excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, targetKey, before.status, before.usage_limit, before.usage_period, JSON.stringify(before.metadata_json ?? {})]
    );
    return;
  }

  if (!RESTORABLE_TABLES.has(targetTable)) return;

  if (!before) {
    await queryPostgres(`delete from public.${targetTable} where tenant_id = $1 and id = $2`, [workspaceId, targetKey]);
    return;
  }

  if (targetTable === "brands") {
    await queryPostgres(
      `
      update public.brands
      set name = $3, slug = $4, domain = $5, phone = $6, email = $7, logo_url = $8,
          business_model = $9, industry = $10, vertical = $11, description = $12,
          primary_goal = $13, primary_location = $14, risk_profile = $15, status = $16, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        targetKey,
        before.name,
        before.slug,
        before.domain,
        before.phone,
        before.email,
        before.logo_url,
        before.business_model,
        before.industry,
        before.vertical,
        before.description,
        before.primary_goal,
        before.primary_location,
        before.risk_profile,
        before.status
      ]
    );
    return;
  }

  if (targetTable === "brand_services") {
    await queryPostgres(
      "update public.brand_services set name = $3, slug = $4, description = $5, priority = $6, active = $7 where tenant_id = $1 and id = $2",
      [workspaceId, targetKey, before.name, before.slug, before.description, before.priority, before.active]
    );
    return;
  }

  if (targetTable === "brand_locations") {
    await queryPostgres(
      "update public.brand_locations set city = $3, state = $4, service_area_name = $5, priority = $6, active = $7 where tenant_id = $1 and id = $2",
      [workspaceId, targetKey, before.city, before.state, before.service_area_name, before.priority, before.active]
    );
    return;
  }

  if (targetTable === "forms") {
    await queryPostgres(
      "update public.forms set name = $3, slug = $4, public_key = $5, active = $6 where tenant_id = $1 and id = $2",
      [workspaceId, targetKey, before.name, before.slug, before.public_key, before.active]
    );
    return;
  }

  if (targetTable === "brand_marketing_settings") {
    await queryPostgres(
      `
      update public.brand_marketing_settings
      set target_customers = $3, cta_goals = $4, ad_goals = $5, seo_targets = $6,
          review_strategy = $7, follow_up_strategy = $8, tone_of_voice = $9,
          approval_mode = $10, auto_create_low_risk_drafts = $11, auto_weekly_seo_posts = $12,
          auto_gbp_post_drafts = $13, auto_facebook_post_drafts = $14, auto_review_request_drafts = $15,
          auto_follow_up_drafts = $16, auto_landing_page_suggestions = $17,
          high_risk_approval_rules = $18::jsonb, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        targetKey,
        before.target_customers,
        before.cta_goals,
        before.ad_goals,
        before.seo_targets,
        before.review_strategy,
        before.follow_up_strategy,
        before.tone_of_voice,
        before.approval_mode,
        before.auto_create_low_risk_drafts,
        before.auto_weekly_seo_posts,
        before.auto_gbp_post_drafts,
        before.auto_facebook_post_drafts,
        before.auto_review_request_drafts,
        before.auto_follow_up_drafts,
        before.auto_landing_page_suggestions,
        JSON.stringify(before.high_risk_approval_rules ?? {})
      ]
    );
    return;
  }

  if (targetTable === "communication_templates") {
    await queryPostgres(
      `
      update public.communication_templates
      set brand_id = $3, name = $4, channel = $5, purpose = $6, subject = $7, body = $8,
          active = $9, requires_approval = $10, metadata_json = $11::jsonb, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        targetKey,
        before.brand_id,
        before.name,
        before.channel,
        before.purpose,
        before.subject,
        before.body,
        before.active,
        before.requires_approval,
        JSON.stringify(before.metadata_json ?? {})
      ]
    );
    return;
  }

  if (targetTable === "brand_landing_pages") {
    await queryPostgres(
      `
      update public.brand_landing_pages
      set title = $3, slug = $4, url = $5, page_type = $6, primary_keyword = $7, status = $8, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, targetKey, before.title, before.slug, before.url, before.page_type, before.primary_keyword, before.status]
    );
    return;
  }

  if (targetTable === "growth_sources") {
    await queryPostgres(
      `
      update public.growth_sources
      set brand_id = $3, source_family = $4, source_name = $5, campaign_name = $6, service_focus = $7,
          city_focus = $8, landing_url = $9, tracking_code = $10, status = $11,
          metadata_json = $12::jsonb, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        targetKey,
        before.brand_id,
        before.source_family,
        before.source_name,
        before.campaign_name,
        before.service_focus,
        before.city_focus,
        before.landing_url,
        before.tracking_code,
        before.status,
        JSON.stringify(before.metadata_json ?? {})
      ]
    );
    return;
  }

  if (targetTable === "follow_up_workflows") {
    await queryPostgres(
      `
      update public.follow_up_workflows
      set brand_id = $3, lead_id = $4, customer_id = $5, estimate_id = $6, invoice_id = $7,
          workflow_type = $8, channel = $9, status = $10, due_at = $11,
          completed_at = $12, assigned_user_id = $13, ai_suggested_message = $14,
          metadata_json = $15::jsonb, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        targetKey,
        before.brand_id,
        before.lead_id,
        before.customer_id,
        before.estimate_id,
        before.invoice_id,
        before.workflow_type,
        before.channel,
        before.status,
        before.due_at,
        before.completed_at,
        before.assigned_user_id,
        before.ai_suggested_message,
        JSON.stringify(before.metadata_json ?? {})
      ]
    );
    return;
  }

  if (targetTable === "review_request_workflows") {
    await queryPostgres(
      `
      update public.review_request_workflows
      set brand_id = $3, customer_id = $4, lead_id = $5, job_id = $6, trigger_event = $7,
          channel = $8, status = $9, scheduled_for = $10, sent_at = $11, rating_received = $12,
          review_url = $13, negative_interception_status = $14, ai_response_draft = $15,
          metadata_json = $16::jsonb, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        targetKey,
        before.brand_id,
        before.customer_id,
        before.lead_id,
        before.job_id,
        before.trigger_event,
        before.channel,
        before.status,
        before.scheduled_for,
        before.sent_at,
        before.rating_received,
        before.review_url,
        before.negative_interception_status,
        before.ai_response_draft,
        JSON.stringify(before.metadata_json ?? {})
      ]
    );
  }
}
