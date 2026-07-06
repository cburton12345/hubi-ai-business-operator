import { generateJsonWithProvider } from "@/lib/ai/model-provider";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

export type SetupGuidanceAction = {
  title: string;
  why: string;
  doNext: string;
  href: string;
  priority: "low" | "normal" | "high" | "critical";
};

export type SetupGuidance = {
  headline: string;
  summary: string;
  missing: string[];
  nextActions: SetupGuidanceAction[];
  websiteAuditNote: string;
  aiUsed: boolean;
};

type WorkspaceStats = {
  brands: string;
  missing_contact: string;
  services: string;
  areas: string;
  forms: string;
  seo_drafts: string;
  hosted_pages: string;
  followups: string;
  review_workflows: string;
  sources: string;
  unpaid_invoices: string;
  open_leads: string;
};

type LatestReport = {
  website_url: string | null;
  score: number | null;
  grade_label: string | null;
  findings_json: unknown;
  recommended_steps_json: unknown;
  created_at: Date;
};

type IntegrationRow = {
  provider: string;
  display_name: string;
  status: string;
  credentials_status: string;
};

type GuidanceAiResponse = {
  headline?: string;
  summary?: string;
  missing?: string[];
  nextActions?: SetupGuidanceAction[];
  websiteAuditNote?: string;
};

function num(value: string | undefined) {
  return Number(value ?? 0);
}

function fallbackGuidance(stats: WorkspaceStats | null, integrations: IntegrationRow[], latestReport: LatestReport | null): SetupGuidance {
  const missing: string[] = [];
  const nextActions: SetupGuidanceAction[] = [];

  if (!stats || num(stats.brands) === 0 || num(stats.missing_contact) > 0) {
    missing.push("Business basics are not complete.");
    nextActions.push({
      title: "Finish the business profile",
      why: "Ferocity needs the business name, phone, email, main service area, and offer before it can safely build pages, forms, and follow-up.",
      doNext: "Open setup and confirm the public business details.",
      href: "/app/setup",
      priority: "high"
    });
  }

  if (!stats || num(stats.services) === 0 || num(stats.areas) === 0) {
    missing.push("Services and service areas are thin.");
    nextActions.push({
      title: "Add services and service areas",
      why: "SEO, lead routing, review asks, pages, and campaigns need real services and towns to work from.",
      doNext: "Add the most profitable services and the first cities or neighborhoods to target.",
      href: "/app/brands",
      priority: "high"
    });
  }

  if (!stats || num(stats.forms) === 0) {
    missing.push("Lead capture is not ready.");
    nextActions.push({
      title: "Create a tracked lead form",
      why: "Without a quote form or tracked link, Ferocity cannot tie website traffic to leads, follow-up, jobs, and revenue.",
      doNext: "Open the Website Connector or Publishing Hub and add the Ferocity lead capture path.",
      href: "/app/publishing-hub",
      priority: "high"
    });
  }

  if (!stats || num(stats.seo_drafts) === 0 || num(stats.hosted_pages) === 0) {
    missing.push("SEO and page work has not been prepared yet.");
    nextActions.push({
      title: "Prepare SEO drafts and page targets",
      why: "A business needs useful offer pages, location or audience pages when relevant, proof, reviews, and clear calls to action before marketing compounds.",
      doNext: "Generate SEO drafts and prepare hosted page targets for review.",
      href: "/app/publishing-hub",
      priority: "normal"
    });
  }

  if (!stats || num(stats.followups) === 0) {
    missing.push("Follow-up automation is not set.");
    nextActions.push({
      title: "Set lead and estimate follow-up",
      why: "Most businesses lose money by replying late or forgetting viewed estimates, stale leads, callbacks, invoices, quotes, or carts.",
      doNext: "Run the operator scan and review the follow-up workflows.",
      href: "/app/operator",
      priority: "high"
    });
  }

  if (!stats || num(stats.review_workflows) === 0) {
    missing.push("Review generation is not set.");
    nextActions.push({
      title: "Set review request timing",
      why: "Reviews, photos, and customer proof are one of the strongest local SEO and conversion assets.",
      doNext: "Open Reviews and prepare review requests after completed work.",
      href: "/app/review",
      priority: "normal"
    });
  }

  const emailReady = integrations.some((item) => ["email_provider", "resend_shared"].includes(item.provider) && (item.status === "connected" || item.credentials_status === "configured"));
  if (!emailReady) {
    missing.push("Verified email is not connected yet.");
    nextActions.push({
      title: "Use app alerts first, then connect email",
      why: "Ferocity can use app alerts and dashboard queues immediately. Verified email adds daily briefs, setup messages, and approved follow-up.",
      doNext: "Open Integrations and connect Resend/email. Keep SMS optional unless the business explicitly wants it later.",
      href: "/app/integrations",
      priority: "normal"
    });
  }

  const websiteAuditNote = latestReport
    ? `Latest website/business score: ${latestReport.grade_label ?? "Report"} (${latestReport.score ?? 0}/100). Use that report to decide the next website and SEO fixes.`
    : "No website/business health score has been run yet. Run an assessment so Ferocity can compare the website, local SEO, reviews, lead capture, and operations.";

  if (!latestReport) {
    nextActions.unshift({
      title: "Run the Business Health Score",
      why: "Ferocity should audit the website and operations before recommending SEO, lead capture, follow-up, and review work.",
      doNext: "Run the assessment with the business website and basic operations answers.",
      href: "/business-health-score",
      priority: "high"
    });
  }

  return {
    headline: nextActions.length ? "Ferocity found the next setup moves." : "The setup foundation looks organized.",
    summary:
      nextActions.length > 0
        ? "Start with the highest priority items. Ferocity should prepare work, keep public actions behind approval, and connect marketing to revenue as the system comes online."
        : "The core setup pieces are in place. Keep improving SEO, reviews, follow-up, and attribution from the Owner Command Center.",
    missing: missing.slice(0, 7),
    nextActions: nextActions.slice(0, 6),
    websiteAuditNote,
    aiUsed: false
  };
}

function sanitizeGuidance(value: GuidanceAiResponse, fallback: SetupGuidance): SetupGuidance {
  const candidateActions = Array.isArray(value.nextActions)
    ? value.nextActions
        .filter((item) => item?.title && item?.why && item?.doNext && item?.href)
        .slice(0, 6)
        .map((item) => ({
          title: String(item.title).slice(0, 160),
          why: String(item.why).slice(0, 500),
          doNext: String(item.doNext).slice(0, 300),
          href: String(item.href).startsWith("/") ? String(item.href) : "/app/build-system",
          priority: ["low", "normal", "high", "critical"].includes(item.priority) ? item.priority : "normal"
        }))
    : [];
  const nextActions = candidateActions.length ? candidateActions : fallback.nextActions;

  return {
    headline: value.headline ? String(value.headline).slice(0, 180) : fallback.headline,
    summary: value.summary ? String(value.summary).slice(0, 700) : fallback.summary,
    missing: Array.isArray(value.missing) && value.missing.length ? value.missing.map(String).slice(0, 8) : fallback.missing,
    nextActions,
    websiteAuditNote: value.websiteAuditNote ? String(value.websiteAuditNote).slice(0, 700) : fallback.websiteAuditNote,
    aiUsed: true
  };
}

export async function getSetupGuidance(): Promise<SetupGuidance> {
  const workspace = await getCurrentWorkspace();
  const [statsResult, integrationsResult, reportResult] = await Promise.all([
    queryPostgres<WorkspaceStats>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status = 'active')::text as brands,
        (select count(*) from public.brands where tenant_id = $1 and status = 'active' and (phone is null or email is null or primary_location is null))::text as missing_contact,
        (select count(*) from public.brand_services where tenant_id = $1 and active = true)::text as services,
        (select count(*) from public.brand_locations where tenant_id = $1 and active = true)::text as areas,
        (select count(*) from public.forms where tenant_id = $1 and active = true)::text as forms,
        (select count(*) from public.ai_drafts where tenant_id = $1 and content_type in ('blog', 'city_page', 'service_page', 'gbp_post', 'landing_page'))::text as seo_drafts,
        (select count(*) from public.brand_landing_pages where tenant_id = $1 and status <> 'archived')::text as hosted_pages,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open','scheduled'))::text as followups,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and status in ('draft','scheduled'))::text as review_workflows,
        (select count(*) from public.growth_sources where tenant_id = $1 and status in ('active','paused'))::text as sources,
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('sent','overdue'))::text as unpaid_invoices,
        (select count(*) from public.leads where tenant_id = $1 and status not in ('closed','lost'))::text as open_leads
      `,
      [workspace.id]
    ),
    queryPostgres<IntegrationRow>(
      `
      select provider, display_name, status, credentials_status
      from public.integration_connections
      where tenant_id = $1
      order by provider
      `,
      [workspace.id]
    ),
    queryPostgres<LatestReport>(
      `
      select website_url, score, grade_label, findings_json, recommended_steps_json, created_at
      from public.website_grader_reports
      where status = 'completed'
      order by created_at desc
      limit 1
      `
    )
  ]);

  const stats = statsResult?.rows[0] ?? null;
  const integrations = integrationsResult?.rows ?? [];
  const latestReport = reportResult?.rows[0] ?? null;
  const fallback = fallbackGuidance(stats, integrations, latestReport);

  const aiResponse = await generateJsonWithProvider<GuidanceAiResponse>({
    tenantId: workspace.id,
    runType: "setup_guidance",
    system:
      "You are Ferocity's AI setup coach for businesses that need more customers, faster follow-up, better marketing, cleaner operations, and revenue visibility. Lead the owner in plain English. Rank what is missing and what to do next. Use contractor/local-service defaults only when the business type calls for them. Never claim live sends, live publishing, ad spend, or provider sync are active unless the data says so. Use existing Ferocity areas; do not invent duplicate systems. Return JSON with headline, summary, missing, nextActions, and websiteAuditNote.",
    user: JSON.stringify({
      workspace,
      stats,
      integrations,
      latestWebsiteOrBusinessHealthReport: latestReport,
      allowedHrefs: [
        "/business-health-score",
        "/app/build-system",
        "/app/publishing-hub",
        "/app/website",
        "/app/seo",
        "/app/sites",
        "/app/operator",
        "/app/review",
        "/app/integrations",
        "/app/controls",
        "/app/owner-command-center"
      ]
    }),
    fallback
  });

  return aiResponse === fallback ? fallback : sanitizeGuidance(aiResponse, fallback);
}
