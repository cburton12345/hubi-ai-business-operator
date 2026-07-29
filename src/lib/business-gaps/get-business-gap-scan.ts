import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getServiceControls } from "@/lib/controls/get-service-controls";
import { getProviderCapabilityReadiness } from "@/lib/integrations/provider-lane-readiness";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type GapStatus = "ready" | "needs_review" | "needs_connection" | "needs_data" | "blocked";

type GapCountsRow = {
  brands: string;
  services: string;
  locations: string;
  forms: string;
  leads: string;
  customers: string;
  jobs: string;
  invoices: string;
  unpaid_invoices: string;
  ai_drafts: string;
  publishing_queue: string;
  proof_items: string;
  website_imports: string;
  provider_accounts: string;
  live_provider_accounts: string;
  action_queue: string;
  recommendations: string;
};

export type BusinessGapItem = {
  key: string;
  area: string;
  title: string;
  status: GapStatus;
  impact: "high" | "medium" | "low";
  whatFerocityCanDo: string;
  blocker: string;
  nextAction: string;
  href: string;
  metric: string;
};

function statusLabel(status: GapStatus) {
  return {
    ready: "Ready",
    needs_review: "Needs review",
    needs_connection: "Needs connection",
    needs_data: "Needs data",
    blocked: "Blocked"
  }[status];
}

function n(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function hasLiveCapability(capabilities: Awaited<ReturnType<typeof getProviderCapabilityReadiness>>, capabilityKey: string) {
  const capability = capabilities.find((item) => item.capabilityKey === capabilityKey);
  if (!capability) return false;
  return capability.customerOwned.liveActionsEnabled || capability.ferocityManaged.liveActionsEnabled;
}

function hasConnectedCapability(capabilities: Awaited<ReturnType<typeof getProviderCapabilityReadiness>>, capabilityKey: string) {
  const capability = capabilities.find((item) => item.capabilityKey === capabilityKey);
  if (!capability) return false;
  return [capability.customerOwned, capability.ferocityManaged].some((lane) =>
    ["connected", "available"].includes(lane.connectionStatus) || lane.credentialsStatus === "configured"
  );
}

function controlMode(controls: Awaited<ReturnType<typeof getServiceControls>>, featureKey: string) {
  return controls.controls.find((control) => control.featureKey === featureKey);
}

function byPriority(a: BusinessGapItem, b: BusinessGapItem) {
  const statusScore: Record<GapStatus, number> = {
    blocked: 5,
    needs_connection: 4,
    needs_data: 3,
    needs_review: 2,
    ready: 1
  };
  const impactScore = { high: 3, medium: 2, low: 1 };
  return statusScore[b.status] - statusScore[a.status] || impactScore[b.impact] - impactScore[a.impact];
}

export async function getBusinessGapScan() {
  const workspaceId = await getCurrentWorkspaceId();
  const [snapshot, controls, capabilities, countsResult] = await Promise.all([
    getDashboardSnapshot(),
    getServiceControls(),
    getProviderCapabilityReadiness(workspaceId),
    queryPostgres<GapCountsRow>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1)::text as brands,
        (select count(*) from public.brand_services where tenant_id = $1)::text as services,
        (select count(*) from public.brand_locations where tenant_id = $1)::text as locations,
        (select count(*) from public.forms where tenant_id = $1)::text as forms,
        (select count(*) from public.leads where tenant_id = $1)::text as leads,
        (select count(*) from public.customers where tenant_id = $1)::text as customers,
        (select count(*) from public.service_jobs where tenant_id = $1)::text as jobs,
        (select count(*) from public.service_invoices where tenant_id = $1)::text as invoices,
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('sent_manually','partially_paid','overdue'))::text as unpaid_invoices,
        (select count(*) from public.ai_drafts where tenant_id = $1 and status in ('draft','needs_review'))::text as ai_drafts,
        (select count(*) from public.publishing_queue where tenant_id = $1 and queue_status in ('draft','needs_approval','approved','scheduled'))::text as publishing_queue,
        (
          (select count(*) from public.ugc_assets where tenant_id = $1) +
          (select count(*) from public.ugc_submissions where tenant_id = $1)
        )::text as proof_items,
        (select count(*) from public.marketing_os_website_imports where tenant_id = $1)::text as website_imports,
        (select count(*) from public.provider_accounts where tenant_id = $1 and credentials_status = 'configured')::text as provider_accounts,
        (select count(*) from public.provider_accounts where tenant_id = $1 and credentials_status = 'configured' and live_actions_enabled = true)::text as live_provider_accounts,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and status in ('needs_review','approved','queued','blocked','failed'))::text as action_queue,
        (
          (select count(*) from public.recommendations where tenant_id = $1 and status in ('open','approved')) +
          (select count(*) from public.revenue_recommendations where tenant_id = $1 and status in ('new','open','approved')) +
          (select count(*) from public.marketing_campaign_recommendations where tenant_id = $1 and status in ('recommended','approved'))
        )::text as recommendations
      `,
      [workspaceId]
    )
  ]);

  const counts = countsResult?.rows[0];
  const emailConnected = hasConnectedCapability(capabilities, "email");
  const emailLive = hasLiveCapability(capabilities, "email");
  const publishingConnected = hasConnectedCapability(capabilities, "website_publishing") || hasConnectedCapability(capabilities, "google_business_profile");
  const publishingLive = hasLiveCapability(capabilities, "website_publishing") || hasLiveCapability(capabilities, "google_business_profile");
  const paymentsConnected = hasConnectedCapability(capabilities, "payments");
  const paymentsLive = hasLiveCapability(capabilities, "payments");
  const adsConnected = ["google_ads", "meta_ads", "tiktok_ads", "reddit_ads", "microsoft_ads"].some((key) => hasConnectedCapability(capabilities, key));
  const adsLive = ["google_ads", "meta_ads", "tiktok_ads", "reddit_ads", "microsoft_ads"].some((key) => hasLiveCapability(capabilities, key));
  const aiControl = controlMode(controls, "ai_generation");
  const seoControl = controlMode(controls, "seo_autopilot");
  const emailControl = controlMode(controls, "email_send");
  const reviewControl = controlMode(controls, "review_requests");
  const paymentControl = controlMode(controls, "payment_collection");

  const gaps = ([
    {
      key: "business-memory",
      area: "Business setup",
      title: "Business info AI can trust",
      status: n(counts?.brands) > 0 && n(counts?.services) > 0 ? "ready" : "needs_data",
      impact: "high",
      metric: `${n(counts?.brands)} brand / ${n(counts?.services)} services / ${n(counts?.locations)} areas`,
      whatFerocityCanDo: "Use services, areas, offers, customers, proof, prices, and rules so AI work sounds like the real business.",
      blocker: n(counts?.services) > 0 ? "Enough core profile data exists to start." : "Add services, service areas, offers, and the rules AI should follow.",
      nextAction: "Fill business info",
      href: "/app/business-brain"
    },
    {
      key: "lead-capture",
      area: "Lead capture",
      title: "Website forms and source tracking",
      status: n(counts?.forms) > 0 || n(counts?.leads) > 0 ? "ready" : "needs_data",
      impact: "high",
      metric: `${n(counts?.forms)} forms / ${n(counts?.leads)} leads`,
      whatFerocityCanDo: "Capture leads, tag where they came from, route them into follow-up, and show which sources create work.",
      blocker: n(counts?.forms) > 0 ? "Lead capture is started." : "Add a Ferocity form, hosted page, website snippet, or partner lead source.",
      nextAction: "Connect lead sources",
      href: "/app/customer-touchpoints"
    },
    {
      key: "follow-up",
      area: "Sales follow-up",
      title: "Lead and estimate follow-up",
      status: snapshot.metrics.followUpsDue > 0 || n(counts?.action_queue) > 0 ? "needs_review" : emailConnected ? "ready" : "needs_connection",
      impact: "high",
      metric: `${snapshot.metrics.followUpsDue} due / ${n(counts?.action_queue)} queued`,
      whatFerocityCanDo: "Prepare replies, reminders, old-lead recovery, estimate follow-up, and manual text/email drafts.",
      blocker: emailLive ? "Email can be used under approval rules." : emailConnected ? "Email is configured, live sends still follow controls." : "Connect email or use manual text drafts first.",
      nextAction: "Open follow-up",
      href: "/app/lead-command"
    },
    {
      key: "posting",
      area: "Posting and SEO",
      title: "Website, GBP, and social posting",
      status: publishingLive ? "ready" : publishingConnected || n(counts?.publishing_queue) > 0 || n(counts?.ai_drafts) > 0 ? "needs_review" : "needs_connection",
      impact: "high",
      metric: `${n(counts?.publishing_queue)} publish items / ${n(counts?.ai_drafts)} drafts`,
      whatFerocityCanDo: "Draft SEO pages, Google profile posts, social posts, proof content, and refresh ideas from real work.",
      blocker: publishingLive ? "A live publishing lane is enabled." : publishingConnected ? "Drafting is ready; live posting still needs approval and live-action settings." : "Connect a website, GBP, or use Ferocity hosted growth pages/manual export.",
      nextAction: "Open publishing",
      href: "/app/publishing-hub"
    },
    {
      key: "reviews-proof",
      area: "Reputation",
      title: "Reviews and customer proof",
      status: n(counts?.proof_items) > 0 || reviewControl?.mode === "enabled" ? "ready" : reviewControl?.mode === "off" ? "blocked" : "needs_data",
      impact: "high",
      metric: `${n(counts?.proof_items)} proof items`,
      whatFerocityCanDo: "Ask for reviews, collect before/after proof, prepare testimonial posts, and turn completed work into marketing.",
      blocker: reviewControl?.mode === "off" ? "Review requests are off for this workspace or plan." : "Add completed jobs, customer proof links, and review request rules.",
      nextAction: "Open proof and reviews",
      href: "/app/proof"
    },
    {
      key: "jobs-money",
      area: "Operations and money",
      title: "Jobs, invoices, expenses, and payment follow-up",
      status: n(counts?.jobs) > 0 || n(counts?.invoices) > 0 ? (n(counts?.unpaid_invoices) > 0 ? "needs_review" : "ready") : "needs_data",
      impact: "high",
      metric: `${n(counts?.jobs)} jobs / ${n(counts?.unpaid_invoices)} unpaid invoices`,
      whatFerocityCanDo: "Track jobs, estimates, invoices, receipts, field costs, reimbursements, and payment reminders.",
      blocker: paymentsLive ? "Online payment collection can use the connected lane." : paymentsConnected ? "Payment provider is configured; live collection still follows fee and approval rules." : "Manual payments work now. Online collection needs Stripe or Connect readiness.",
      nextAction: "Open jobs and money",
      href: "/app/service-command"
    },
    {
      key: "paid-growth",
      area: "Advertising",
      title: "Paid ads and managed growth",
      status: adsLive ? "ready" : adsConnected ? "needs_review" : "needs_connection",
      impact: "medium",
      metric: adsConnected ? "ad account ready for review" : "no ad account connected",
      whatFerocityCanDo: "Prepare campaign ideas, ad briefs, video scripts, audiences, tracking, and launch packages.",
      blocker: adsLive ? "A live ad lane is enabled." : adsConnected ? "Ad reporting or credentials exist; spend and posting still need approval." : "Connect customer ad accounts or use Ferocity-managed marketing once available and approved.",
      nextAction: "Open Marketing OS",
      href: "/app/marketing-os"
    },
    {
      key: "automation-safety",
      area: "Controls",
      title: "Safe hands-free rules",
      status: controls.summary.off > 0 ? "blocked" : controls.summary.reviewRequired + controls.summary.draftOnly > 0 ? "needs_review" : "ready",
      impact: "high",
      metric: `${controls.summary.reviewRequired} review / ${controls.summary.draftOnly} draft-only / ${controls.summary.off} off`,
      whatFerocityCanDo: "Run scans, prepare drafts, queue actions, log work, and only interrupt the owner when money, risk, failure, or approval needs attention.",
      blocker: aiControl?.planAllowed === false ? aiControl.planRule : "Adjust modes for sending, posting, spending, AI usage, and payments.",
      nextAction: "Open controls",
      href: "/app/controls"
    }
  ] satisfies BusinessGapItem[]).sort(byPriority);

  const score = Math.max(0, Math.min(100, Math.round(
    gaps.reduce((total, gap) => {
      const value = gap.status === "ready" ? 12 : gap.status === "needs_review" ? 8 : gap.status === "needs_data" ? 5 : gap.status === "needs_connection" ? 4 : 2;
      return total + value;
    }, 0) / (gaps.length * 12) * 100
  )));

  const liveSummary = {
    email: emailLive ? "Live under rules" : emailConnected ? "Connected, review first" : "Needs connection",
    posting: publishingLive ? "Live under rules" : publishingConnected ? "Connected, review first" : "Needs connection",
    payments: paymentsLive ? "Live under rules" : paymentsConnected ? "Connected, review first" : "Manual or needs connection",
    ads: adsLive ? "Live under rules" : adsConnected ? "Connected, review first" : "Needs connection"
  };

  return {
    workspaceId,
    workspaceName: snapshot.tenantName,
    score,
    statusLabel,
    gaps,
    topGaps: gaps.filter((gap) => gap.status !== "ready").slice(0, 4),
    readyCount: gaps.filter((gap) => gap.status === "ready").length,
    blockedCount: gaps.filter((gap) => gap.status === "blocked").length,
    reviewCount: gaps.filter((gap) => gap.status === "needs_review").length,
    connectionCount: gaps.filter((gap) => gap.status === "needs_connection").length,
    dataCount: gaps.filter((gap) => gap.status === "needs_data").length,
    liveSummary,
    controls: {
      ai: aiControl?.plainRule ?? "AI work follows workspace controls.",
      seo: seoControl?.plainRule ?? "SEO and posting follow review rules.",
      email: emailControl?.plainRule ?? "Email follows approval and provider rules.",
      review: reviewControl?.plainRule ?? "Review requests follow approval and consent rules.",
      payments: paymentControl?.plainRule ?? "Payments follow provider, fee, and approval rules."
    },
    counts: {
      recommendations: n(counts?.recommendations),
      actionQueue: n(counts?.action_queue),
      providerAccounts: n(counts?.provider_accounts),
      liveProviderAccounts: n(counts?.live_provider_accounts)
    }
  };
}
