import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { sendFerocityNotificationEmail, sendTransactionalEmail } from "@/lib/email/transactional";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";

const accessRequestSchema = z.object({
  name: z.string().trim().max(160).optional(),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional(),
  companyName: z.string().trim().max(180).optional(),
  businessType: z.string().trim().max(120).optional(),
  websiteUrl: z.string().trim().max(240).optional(),
  websiteConnectionPlan: z.string().trim().max(80).optional(),
  requestedPlan: z.string().trim().max(80).optional(),
  mainGoal: z.string().trim().max(120).optional(),
  leadSources: z.array(z.string().trim().max(80)).optional(),
  message: z.string().trim().max(2500).optional(),
  sourceDetail: z.string().trim().max(240).optional(),
  consentToContact: z.literal("on"),
  createWorkspace: z.string().optional(),
  website: z.string().max(0).optional()
});

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function publicKey(prefix: string) {
  return `${prefix}-${randomSessionToken().slice(0, 12).toLowerCase()}`;
}

function redirectTo(request: NextRequest, path: string) {
  return safeRedirect(request, path);
}

function appUrl(request: NextRequest, path: string) {
  return new URL(path, request.nextUrl.origin).toString();
}

function inferBusinessModel(businessType: string | undefined | null) {
  const lower = businessType?.toLowerCase() ?? "";
  if (lower.includes("rental") || lower.includes("trailer")) return "rental";
  if (lower.includes("software") || lower.includes("saas")) return "software";
  if (lower.includes("marketplace")) return "marketplace";
  return "local_service";
}

function defaultServiceName(businessType: string | undefined | null, mainGoal: string | undefined | null) {
  const lower = businessType?.toLowerCase() ?? "";
  if (lower.includes("roof")) return "Roof repair";
  if (lower.includes("hvac")) return "HVAC service";
  if (lower.includes("clean")) return "Cleaning service";
  if (lower.includes("trailer")) return "Trailer rental";
  if (mainGoal === "seo_reviews") return "Primary service";
  return "General service";
}

function normalizeLeadSources(values: string[] | undefined) {
  const allowed = new Set([
    "website_form",
    "hosted_pages",
    "local_seo",
    "google_business_profile",
    "reviews",
    "facebook",
    "paid_ads",
    "marketplacepro",
    "phone_calls",
    "manual_referrals"
  ]);
  const unique = Array.from(new Set((values ?? []).filter((value) => allowed.has(value))));
  return unique.length ? unique : ["website_form", "local_seo", "phone_calls"];
}

function growthSourceFor(key: string) {
  const map: Record<string, { family: string; name: string; campaign: string }> = {
    website_form: { family: "organic", name: "Website form", campaign: "Lead capture" },
    hosted_pages: { family: "organic", name: "Ferocity hosted pages", campaign: "Hosted growth pages" },
    local_seo: { family: "organic", name: "Local SEO", campaign: "Service and city pages" },
    google_business_profile: { family: "gbp", name: "Google Business Profile", campaign: "Profile activity" },
    reviews: { family: "gbp", name: "Reviews", campaign: "Review flow" },
    facebook: { family: "referral", name: "Facebook and community", campaign: "Community presence" },
    paid_ads: { family: "paid", name: "Paid ads", campaign: "Campaign tracking" },
    marketplacepro: { family: "referral", name: "MarketplacePro", campaign: "Marketplace leads" },
    phone_calls: { family: "direct", name: "Phone calls", campaign: "Call intake" },
    manual_referrals: { family: "referral", name: "Referrals and manual leads", campaign: "Referral tracking" }
  };
  return map[key] ?? { family: "unknown", name: key, campaign: "Setup request" };
}

async function seedGrowthSources(input: { tenantId: string; brandId: string; accessRequestId: string; leadSources?: string[] }) {
  for (const sourceKey of normalizeLeadSources(input.leadSources)) {
    const source = growthSourceFor(sourceKey);
    try {
      await queryPostgres(
        `
        insert into public.growth_sources (
          tenant_id,
          brand_id,
          source_family,
          source_name,
          campaign_name,
          service_focus,
          city_focus,
          tracking_code,
          status,
          metadata_json,
          updated_at
        )
        values ($1, $2, $3, $4, $5, null, null, $6, 'active', $7::jsonb, now())
        on conflict (tenant_id, brand_id, source_family, source_name, campaign_name, service_focus, city_focus) do update
        set status = 'active',
            tracking_code = excluded.tracking_code,
            metadata_json = public.growth_sources.metadata_json || excluded.metadata_json,
            updated_at = now()
        `,
        [
          input.tenantId,
          input.brandId,
          source.family,
          source.name,
          source.campaign,
          `src_${sourceKey}`,
          JSON.stringify({ createdFromAccessRequest: input.accessRequestId, sourceKey })
        ]
      );
    } catch (error) {
      await logAppError({
        source: "public.access_requests.growth_sources",
        message: "Unable to create growth source for access request.",
        severity: "warning",
        tenantId: input.tenantId,
        metadata: {
          accessRequestId: input.accessRequestId,
          brandId: input.brandId,
          sourceKey,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
}

async function recordAccessEmailStatus(input: {
  requestId: string;
  key: string;
  result: { ok: boolean; providerMessageId?: string | null; skipped?: boolean; error?: string };
}) {
  await queryPostgres(
    `
    update public.access_requests
    set metadata_json = jsonb_set(
          metadata_json,
          array['emailNotifications', $2],
          $3::jsonb,
          true
        ),
        updated_at = now()
    where id = $1
    `,
    [
      input.requestId,
      input.key,
      JSON.stringify({
        ok: input.result.ok,
        skipped: input.result.skipped ?? false,
        error: input.result.error ?? null,
        providerMessageId: input.result.providerMessageId ?? null,
        at: new Date().toISOString()
      })
    ]
  );
}

async function sendAccessRequestEmails(input: {
  request: NextRequest;
  requestId: string;
  email: string;
  name?: string;
  companyName?: string;
  businessType?: string;
  requestedPlan?: string;
  mainGoal?: string;
  message?: string;
  workspaceStatus?: "created" | "reused" | "existing" | "pending" | "request_only";
  workspaceSlug?: string;
  inviteToken?: string;
  tenantId?: string | null;
}) {
  const inviteUrl = input.inviteToken ? appUrl(input.request, `/invite/${input.inviteToken}`) : null;
  const signInUrl = appUrl(input.request, "/login");
  const startUrl = appUrl(input.request, "/start");
  const displayName = input.name?.trim() || input.companyName?.trim() || "there";
  const workspaceLine = input.workspaceSlug ? `Workspace: ${input.workspaceSlug}` : "Workspace: pending review";
  const planLine = input.requestedPlan ? `Requested plan: ${input.requestedPlan}` : "Requested plan: not sure yet";

  const subject =
    input.workspaceStatus === "existing"
      ? "Your Ferocity workspace is already ready"
      : inviteUrl
        ? "Your Ferocity setup link"
        : "We received your Ferocity setup request";

  const text = inviteUrl
    ? `Hi ${displayName},

Your Ferocity workspace is ready to claim.

${workspaceLine}
${planLine}

Create your owner account here:
${inviteUrl}

Ferocity starts in safe setup mode. It will not send customer messages, publish content, change ads, or start billing until you review and turn those actions on.

If you did not request this, you can ignore this email.`
    : input.workspaceStatus === "existing"
      ? `Hi ${displayName},

That email already has access to a Ferocity workspace.

Sign in here:
${signInUrl}

If you need a different workspace or cannot sign in, submit another setup request here:
${startUrl}`
      : `Hi ${displayName},

We received your Ferocity setup request.

${planLine}
Business type: ${input.businessType || "not provided"}
Main goal: ${input.mainGoal || "not provided"}

Ferocity will keep customer messages, publishing, ad changes, and billing off until a workspace owner reviews them.

If you selected automatic workspace creation and did not get an invite link, the request was saved for review.`;

  const confirmation = await sendTransactionalEmail({
    to: input.email,
    subject,
    text,
    tenantId: input.tenantId,
    eventKey: "access_request_confirmation",
    metadata: {
      accessRequestId: input.requestId,
      workspaceStatus: input.workspaceStatus,
      workspaceSlug: input.workspaceSlug
    }
  });
  await recordAccessEmailStatus({
    requestId: input.requestId,
    key: "requester",
    result: confirmation
  });

  const admin = await sendFerocityNotificationEmail({
    subject: `New Ferocity setup request: ${input.companyName || input.email}`,
    text: `New Ferocity setup request

Email: ${input.email}
Name: ${input.name || "not provided"}
Company: ${input.companyName || "not provided"}
Business type: ${input.businessType || "not provided"}
Requested plan: ${input.requestedPlan || "not sure"}
Main goal: ${input.mainGoal || "not provided"}
Workspace status: ${input.workspaceStatus || "request_only"}
${workspaceLine}
Invite created: ${inviteUrl ? "yes" : "no"}

Message:
${input.message || "none"}`,
    tenantId: input.tenantId,
    eventKey: "access_request_admin_notice",
    metadata: {
      accessRequestId: input.requestId,
      requesterEmail: input.email,
      workspaceStatus: input.workspaceStatus,
      workspaceSlug: input.workspaceSlug
    }
  });
  await recordAccessEmailStatus({
    requestId: input.requestId,
    key: "admin",
    result: admin
  });
}

async function createStarterWorkspace(input: {
  requestId: string;
  email: string;
  name?: string;
  phone?: string;
  companyName?: string;
  businessType?: string;
  websiteUrl?: string;
  requestedPlan?: string;
  mainGoal?: string;
  message?: string;
  leadSources?: string[];
  websiteConnectionPlan?: string | null;
}) {
  const existingInviteResult = await queryPostgres<{ tenant_id: string; slug: string }>(
    `
    select wi.tenant_id, t.slug
    from public.workspace_invites wi
    join public.tenants t on t.id = wi.tenant_id
    where lower(wi.email) = lower($1)
      and t.status <> 'archived'
    order by wi.updated_at desc nulls last, wi.created_at desc
    limit 1
    `,
    [input.email]
  );
  const existingInvite = existingInviteResult?.rows[0];
  if (existingInvite) {
    const token = randomSessionToken();
    await queryPostgres(
      `
      update public.workspace_invites
      set role = 'owner',
          status = 'pending',
          invite_token_hash = $3,
          expires_at = now() + interval '14 days',
          revoked_at = null,
          updated_at = now()
      where tenant_id = $1
        and lower(email) = lower($2)
      `,
      [existingInvite.tenant_id, input.email, hashSessionToken(token)]
    );
    await queryPostgres(
      `
      update public.access_requests
      set status = 'invited',
          metadata_json = metadata_json || $2::jsonb,
          updated_at = now()
      where id = $1
      `,
      [
        input.requestId,
        JSON.stringify({
          reusedExistingWorkspace: true,
          workspaceId: existingInvite.tenant_id,
          workspaceSlug: existingInvite.slug,
          inviteRefreshed: true,
          liveActionsEnabled: false
        })
      ]
    );

    return {
      status: "created" as const,
      tenantId: existingInvite.tenant_id,
      workspaceSlug: existingInvite.slug,
      inviteToken: token,
      reused: true
    };
  }

  const existingUserResult = await queryPostgres<{ tenant_id: string; slug: string }>(
    `
    select tu.tenant_id, t.slug
    from public.users u
    join public.tenant_users tu on tu.user_id = u.id and tu.status = 'active'
    join public.tenants t on t.id = tu.tenant_id and t.status <> 'archived'
    where lower(u.email) = lower($1)
    order by tu.updated_at desc nulls last, tu.created_at desc
    limit 1
    `,
    [input.email]
  );
  const existingUser = existingUserResult?.rows[0];
  if (existingUser) {
    await queryPostgres(
      `
      update public.access_requests
      set status = 'reviewing',
          metadata_json = metadata_json || $2::jsonb,
          updated_at = now()
      where id = $1
      `,
      [
        input.requestId,
        JSON.stringify({
          existingAccountFound: true,
          workspaceId: existingUser.tenant_id,
          workspaceSlug: existingUser.slug,
          nextStep: "login_existing_account"
        })
      ]
    );

    return {
      status: "existing_account" as const,
      tenantId: existingUser.tenant_id,
      workspaceSlug: existingUser.slug
    };
  }

  const workspaceName = emptyToNull(input.companyName) ?? `${input.email.split("@")[0]} Workspace`;
  const baseSlug = slugify(workspaceName) || `workspace-${randomSessionToken().slice(0, 6).toLowerCase()}`;
  const workspaceSlug = `${baseSlug}-${randomSessionToken().slice(0, 5).toLowerCase()}`;
  const brandSlug = slugify(workspaceName) || "main-brand";
  const planKey = input.requestedPlan && ["free", "starter", "growth", "operator"].includes(input.requestedPlan) ? input.requestedPlan : "free";
  const token = randomSessionToken();

  const workspaceResult = await queryPostgres<{ id: string; slug: string }>(
    `
    insert into public.tenants (name, slug, account_type, status, billing_status, plan_key, onboarding_status)
    values ($1, $2, 'customer', $4, $5, $3, 'not_started')
    returning id, slug
    `,
    [workspaceName, workspaceSlug, planKey, planKey === "free" ? "active" : "trial", planKey === "free" ? "free" : "trialing"]
  );
  const workspace = workspaceResult?.rows[0];
  if (!workspace) return null;

  const brandResult = await queryPostgres<{ id: string }>(
    `
    insert into public.brands (
      tenant_id,
      name,
      slug,
      domain,
      phone,
      email,
      business_model,
      industry,
      vertical,
      description,
      primary_goal,
      risk_profile,
      status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, 'normal', 'active')
    returning id
    `,
    [
      workspace.id,
      workspaceName,
      brandSlug,
      emptyToNull(input.websiteUrl),
      emptyToNull(input.phone),
      input.email,
      inferBusinessModel(input.businessType),
      emptyToNull(input.businessType),
      emptyToNull(input.message),
      emptyToNull(input.mainGoal)
    ]
  );
  const brandId = brandResult?.rows[0]?.id;
  if (!brandId) return null;

  await queryPostgres(
    `
    insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
    values ($1, $2, $3, $4, 'Starter service created from public setup request.', 100, true)
    on conflict (brand_id, slug) do nothing
    `,
    [workspace.id, brandId, defaultServiceName(input.businessType, input.mainGoal), slugify(defaultServiceName(input.businessType, input.mainGoal))]
  );

  await queryPostgres(
    `
    insert into public.brand_marketing_settings (
      tenant_id,
      brand_id,
      target_customers,
      cta_goals,
      seo_targets,
      review_strategy,
      follow_up_strategy,
      tone_of_voice,
      approval_mode
    )
    values ($1, $2, null, $3, $4, $5, $6, 'Clear, direct, helpful, local-service friendly.', 'manual')
    on conflict (brand_id) do nothing
    `,
    [
      workspace.id,
      brandId,
      "Capture qualified leads and route them into Ferocity for review.",
      input.mainGoal === "seo_reviews" ? "Useful local SEO, review flow, and service page drafts." : "Draft-first growth setup.",
      "Ask happy customers at the right time. Keep negative feedback internal first.",
      "Prepare follow-up tasks and drafts. Do not send automatically until approved."
    ]
  );

  const leadFormKey = publicKey(`${workspace.slug}-${brandSlug}-lead`);
  await queryPostgres(
    `
    insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
    values ($1, $2, 'Primary Lead Form', 'primary-lead-form', $3, true)
    on conflict (brand_id, slug) do update
    set public_key = excluded.public_key, active = true
    `,
    [workspace.id, brandId, leadFormKey]
  );

  await seedGrowthSources({
    tenantId: workspace.id,
    brandId,
    accessRequestId: input.requestId,
    leadSources: input.leadSources
  });

  await queryPostgres(
    `
    insert into public.billing_subscriptions (
      tenant_id,
      plan_key,
      status,
      seats,
      current_period_start,
      current_period_end,
      metadata_json
    )
    values ($1, $2, $4, 1, now(), $5, $3::jsonb)
    on conflict (tenant_id) do nothing
    `,
    [
      workspace.id,
      planKey,
      JSON.stringify({
        autoCreatedFromAccessRequest: input.requestId,
        stripeConnected: false,
        liveBilling: false
      }),
      planKey === "free" ? "active" : "trialing",
      planKey === "free" ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    ]
  );

  await queryPostgres(
    `
    insert into public.workspace_invites (tenant_id, email, role, status, invite_token_hash, expires_at, updated_at)
    values ($1, lower($2), 'owner', 'pending', $3, now() + interval '14 days', now())
    on conflict (tenant_id, email) do update
    set role = 'owner',
        status = 'pending',
        invite_token_hash = excluded.invite_token_hash,
        expires_at = excluded.expires_at,
        revoked_at = null,
        updated_at = now()
    `,
    [workspace.id, input.email, hashSessionToken(token)]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'system', 'workspace.auto_created_from_public_request', 'tenant', $1, $3::jsonb)
    `,
    [
      workspace.id,
      brandId,
      JSON.stringify({
        accessRequestId: input.requestId,
        planKey,
        leadFormKey,
        leadSources: normalizeLeadSources(input.leadSources),
        websiteConnectionPlan: input.websiteConnectionPlan,
        liveActionsEnabled: false
      })
    ]
  );

  await queryPostgres(
    `
    update public.access_requests
    set status = 'invited',
        metadata_json = metadata_json || $2::jsonb,
        updated_at = now()
    where id = $1
    `,
    [
      input.requestId,
      JSON.stringify({
        autoWorkspaceCreated: true,
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        brandId,
        leadFormKey,
        leadSources: normalizeLeadSources(input.leadSources),
        websiteConnectionPlan: input.websiteConnectionPlan,
        inviteCreated: true,
        liveActionsEnabled: false
      })
    ]
  );

  return {
    status: "created" as const,
    tenantId: workspace.id,
    workspaceSlug: workspace.slug,
    inviteToken: token,
    reused: false
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = accessRequestSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    businessType: String(formData.get("businessType") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    websiteConnectionPlan: String(formData.get("websiteConnectionPlan") ?? ""),
    requestedPlan: String(formData.get("requestedPlan") ?? ""),
    mainGoal: String(formData.get("mainGoal") ?? ""),
    leadSources: formData.getAll("leadSources").map(String),
    message: String(formData.get("message") ?? ""),
    sourceDetail: String(formData.get("sourceDetail") ?? ""),
    consentToContact: formData.get("consentToContact"),
    createWorkspace: String(formData.get("createWorkspace") ?? ""),
    website: String(formData.get("website") ?? "")
  });

  if (!parsed.success) {
    return redirectTo(request, "/start?error=1");
  }

  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const priority = parsed.data.mainGoal?.includes("fast_lead_response") || parsed.data.mainGoal?.includes("seo_reviews") ? "high" : "normal";

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.access_requests (
      request_type,
      status,
      priority,
      name,
      email,
      phone,
      company_name,
      business_type,
      website_url,
      requested_plan,
      main_goal,
      message,
      source,
      source_detail,
      metadata_json,
      ip_address,
      user_agent
    )
    values (
      'early_access',
      'new',
      $1,
      $2,
      lower($3),
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      'ferocity_public_site',
      $11,
      $12::jsonb,
      $13::inet,
      $14
    )
    returning id
    `,
    [
      priority,
      emptyToNull(parsed.data.name),
      parsed.data.email,
      emptyToNull(parsed.data.phone),
      emptyToNull(parsed.data.companyName),
      emptyToNull(parsed.data.businessType),
      emptyToNull(parsed.data.websiteUrl),
      emptyToNull(parsed.data.requestedPlan),
      emptyToNull(parsed.data.mainGoal),
      emptyToNull(parsed.data.message),
      emptyToNull(parsed.data.sourceDetail),
      JSON.stringify({
        consentToContact: true,
        submittedAt: new Date().toISOString(),
        leadSources: normalizeLeadSources(parsed.data.leadSources),
        websiteConnectionPlan: emptyToNull(parsed.data.websiteConnectionPlan),
        launchMode: parsed.data.createWorkspace === "on" ? "auto_workspace_requested" : "request_access_no_auto_workspace",
        nextStep: parsed.data.createWorkspace === "on" ? "workspace_invite_created_when_safe" : "review_then_invite_or_setup_call"
      }),
      ipAddress,
      userAgent
    ]
  );

  if (!result?.rows[0]) {
    await logAppError({
      source: "public.access_requests",
      message: "Unable to create access request.",
      severity: "error",
      metadata: { email: parsed.data.email, sourceDetail: parsed.data.sourceDetail }
    });
    return redirectTo(request, "/start?error=save");
  }

  if (parsed.data.createWorkspace === "on") {
    const created = await createStarterWorkspace({
      requestId: result.rows[0].id,
      email: parsed.data.email,
      name: parsed.data.name,
      phone: parsed.data.phone,
      companyName: parsed.data.companyName,
      businessType: parsed.data.businessType,
      websiteUrl: parsed.data.websiteUrl,
      websiteConnectionPlan: parsed.data.websiteConnectionPlan,
      requestedPlan: parsed.data.requestedPlan,
      mainGoal: parsed.data.mainGoal,
      message: parsed.data.message,
      leadSources: normalizeLeadSources(parsed.data.leadSources)
    });

    if (created) {
      if (created.status === "existing_account") {
        await sendAccessRequestEmails({
          request,
          requestId: result.rows[0].id,
          email: parsed.data.email,
          name: parsed.data.name,
          companyName: parsed.data.companyName,
          businessType: parsed.data.businessType,
          requestedPlan: parsed.data.requestedPlan,
          mainGoal: parsed.data.mainGoal,
          message: parsed.data.message,
          workspaceStatus: "existing",
          workspaceSlug: created.workspaceSlug,
          tenantId: created.tenantId
        });
        return redirectTo(
          request,
          `/start/thanks?workspace=existing&workspaceSlug=${encodeURIComponent(created.workspaceSlug)}`
        );
      }

      await sendAccessRequestEmails({
        request,
        requestId: result.rows[0].id,
        email: parsed.data.email,
        name: parsed.data.name,
        companyName: parsed.data.companyName,
        businessType: parsed.data.businessType,
        requestedPlan: parsed.data.requestedPlan,
        mainGoal: parsed.data.mainGoal,
        message: parsed.data.message,
        workspaceStatus: created.reused ? "reused" : "created",
        workspaceSlug: created.workspaceSlug,
        inviteToken: created.inviteToken,
        tenantId: created.tenantId
      });
      return redirectTo(
        request,
        `/start/thanks?workspace=${created.reused ? "reused" : "created"}&workspaceSlug=${encodeURIComponent(created.workspaceSlug)}&invite=${encodeURIComponent(created.inviteToken)}`
      );
    }

    await logAppError({
      source: "public.access_requests",
      message: "Access request saved, but automatic workspace creation failed.",
      severity: "warning",
      metadata: { accessRequestId: result.rows[0].id, email: parsed.data.email }
    });
    await sendAccessRequestEmails({
      request,
      requestId: result.rows[0].id,
      email: parsed.data.email,
      name: parsed.data.name,
      companyName: parsed.data.companyName,
      businessType: parsed.data.businessType,
      requestedPlan: parsed.data.requestedPlan,
      mainGoal: parsed.data.mainGoal,
      message: parsed.data.message,
      workspaceStatus: "pending"
    });
    return redirectTo(request, "/start/thanks?workspace=pending");
  }

  await sendAccessRequestEmails({
    request,
    requestId: result.rows[0].id,
    email: parsed.data.email,
    name: parsed.data.name,
    companyName: parsed.data.companyName,
    businessType: parsed.data.businessType,
    requestedPlan: parsed.data.requestedPlan,
    mainGoal: parsed.data.mainGoal,
    message: parsed.data.message,
    workspaceStatus: "request_only"
  });

  return redirectTo(request, "/start/thanks");
}
