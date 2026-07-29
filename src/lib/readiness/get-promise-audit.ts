import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { queryPostgres } from "@/lib/db/postgres";
import { getFeatureReadinessItems } from "@/lib/readiness/feature-readiness";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type PromiseAuditStatus = "strong" | "watch" | "needs_work" | "blocked";

export type PromiseAuditQuestion = {
  question: string;
  status: PromiseAuditStatus;
  answer: string;
  proof: string;
  nextAction: string;
  href: string;
};

export type PromiseAuditSummary = {
  score: number;
  strong: number;
  watch: number;
  needsWork: number;
  blocked: number;
  counts: PromiseAuditCounts;
  questions: PromiseAuditQuestion[];
};

type PromiseAuditCounts = {
  connectedIntegrations: number;
  activeForms: number;
  leads: number;
  customers: number;
  jobs: number;
  estimates: number;
  invoices: number;
  aiWorkflows: number;
  aiOutputs: number;
  ownerEvents: number;
  pushSubscriptions: number;
};

type CountRow = {
  connected_integrations: string;
  active_forms: string;
  leads: string;
  customers: string;
  jobs: string;
  estimates: string;
  invoices: string;
  ai_workflows: string;
  ai_outputs: string;
  owner_events: string;
  push_subscriptions: string;
};

function numberFrom(value: string | undefined) {
  return Number(value ?? 0);
}

function countStatus(count: number, fallback: PromiseAuditStatus = "needs_work"): PromiseAuditStatus {
  return count > 0 ? "strong" : fallback;
}

function scoreFor(status: PromiseAuditStatus) {
  if (status === "strong") return 1;
  if (status === "watch") return 0.7;
  if (status === "needs_work") return 0.35;
  return 0;
}

export async function getPromiseAudit(): Promise<PromiseAuditSummary> {
  const workspaceId = await getCurrentWorkspaceId();
  const [features, billing, countResult] = await Promise.all([
    getFeatureReadinessItems(),
    getBillingOverview(),
    queryPostgres<CountRow>(
      `
        select
          (select count(*) from public.integration_connections where tenant_id = $1 and (status = 'connected' or credentials_status = 'configured'))::text as connected_integrations,
          (select count(*) from public.forms where tenant_id = $1 and active = true)::text as active_forms,
          (select count(*) from public.leads where tenant_id = $1)::text as leads,
          (select count(*) from public.customers where tenant_id = $1)::text as customers,
          (select count(*) from public.service_jobs where tenant_id = $1)::text as jobs,
          (select count(*) from public.service_estimates where tenant_id = $1)::text as estimates,
          (select count(*) from public.service_invoices where tenant_id = $1)::text as invoices,
          (select count(*) from public.ai_agent_workflows where tenant_id = $1 and status in ('active', 'paused', 'draft'))::text as ai_workflows,
          (select count(*) from public.ai_agent_outputs where tenant_id = $1 and status in ('needs_review', 'draft', 'queued'))::text as ai_outputs,
          (select count(*) from public.owner_command_events where tenant_id = $1)::text as owner_events,
          (select count(*) from public.push_subscriptions where tenant_id = $1 and status = 'active')::text as push_subscriptions
      `,
      [workspaceId]
    )
  ]);

  const row = countResult?.rows[0];
  const counts: PromiseAuditCounts = {
    connectedIntegrations: numberFrom(row?.connected_integrations),
    activeForms: numberFrom(row?.active_forms),
    leads: numberFrom(row?.leads),
    customers: numberFrom(row?.customers),
    jobs: numberFrom(row?.jobs),
    estimates: numberFrom(row?.estimates),
    invoices: numberFrom(row?.invoices),
    aiWorkflows: numberFrom(row?.ai_workflows),
    aiOutputs: numberFrom(row?.ai_outputs),
    ownerEvents: numberFrom(row?.owner_events),
    pushSubscriptions: numberFrom(row?.push_subscriptions)
  };

  const featureCounts = {
    live: features.filter((feature) => feature.state === "live_now").length,
    approval: features.filter((feature) => feature.state === "approval_first").length,
    connection: features.filter((feature) => feature.state === "needs_connection").length,
    higherPlan: features.filter((feature) => feature.state === "higher_plan").length
  };
  const stripeReady = billing.readiness.some((item) => item.label.toLowerCase().includes("stripe") && item.status === "ready");
  const connectReady = billing.readiness.some((item) => item.label.toLowerCase().includes("connect") && item.status === "ready");
  const hasCoreOps = counts.customers + counts.jobs + counts.estimates + counts.invoices > 0;
  const hasGrowthLoop = counts.activeForms > 0 && (counts.leads > 0 || counts.aiWorkflows > 0);

  const questions: PromiseAuditQuestion[] = [
    {
      question: "Are we promising live functionality or only a future idea?",
      status: featureCounts.connection > 0 ? "watch" : "strong",
      answer: "Ferocity separates live tools, approval-required work, higher-plan features, and provider-gated features.",
      proof: `${featureCounts.live} live, ${featureCounts.approval} approval-required, ${featureCounts.connection} need connection, ${featureCounts.higherPlan} higher-plan.`,
      nextAction: "Keep public pages tied to the same readiness language and never sell provider-gated actions as live.",
      href: "/app/feature-readiness"
    },
    {
      question: "Can a normal owner understand what Ferocity does without reading a wall of features?",
      status: "watch",
      answer: "The public story now leads with AI handling approved repeat work, then points to outcomes: leads, jobs, money, reviews, marketing, and daily attention.",
      proof: "Home, Features, Pricing, Start, and Demo pages were simplified, but this needs ongoing human review before every deploy.",
      nextAction: "Read public pages on mobile before deploy and cut any sentence that sounds like internal architecture.",
      href: "/"
    },
    {
      question: "Can someone start without every key connected?",
      status: "strong",
      answer: "Yes. The product supports forms, manual tracking, setup plans, drafts, alerts, and review-required workflows before every provider is connected.",
      proof: `${counts.activeForms} active form(s), ${featureCounts.approval} approval-required feature(s), and setup/onboarding paths are available.`,
      nextAction: "Keep onboarding focused on one chosen outcome first, then recommend extra connections later.",
      href: "/app/welcome"
    },
    {
      question: "Does AI actually create work, or is it just dashboard decoration?",
      status: countStatus(counts.aiWorkflows + counts.aiOutputs, "watch"),
      answer: "AI workflows and outputs exist as real records. The honest model is draft, queue, approve, log, and then send/publish only when connected.",
      proof: `${counts.aiWorkflows} AI workflow(s) and ${counts.aiOutputs} draft/queued output(s) in this workspace.`,
      nextAction: "Run AI Workforce on an empty workspace and confirm it creates visible, reviewable actions.",
      href: "/app/ai-workforce"
    },
    {
      question: "Can Ferocity help get more booked income instead of just reporting problems?",
      status: hasGrowthLoop ? "strong" : "watch",
      answer: "The growth loop connects lead capture, source tracking, follow-up, content drafts, reviews, estimates, invoices, and revenue records.",
      proof: `${counts.leads} lead(s), ${counts.estimates} estimate(s), ${counts.invoices} invoice(s), ${counts.aiWorkflows} AI workflow(s).`,
      nextAction: "For each customer, connect at least one traffic source, one form, one follow-up rule, and one money record.",
      href: "/app/revenue-growth"
    },
    {
      question: "Can Ferocity run daily operations for a simple business?",
      status: hasCoreOps ? "strong" : "needs_work",
      answer: "Jobs, bids, estimates, invoices, materials, receipts, reminders, crew planning, and cash collection exist in the app.",
      proof: `${counts.customers} customer(s), ${counts.jobs} job(s), ${counts.estimates} estimate(s), ${counts.invoices} invoice(s).`,
      nextAction: "Seed or onboard a real simple business and complete the whole bid-to-payment path.",
      href: "/app/job-tracker"
    },
    {
      question: "Can employees use it without seeing owner-only businesses or unrelated projects?",
      status: "watch",
      answer: "Workspace access and role-based views exist, but this must stay under QA because tenant isolation is launch-critical.",
      proof: "The app has workspace switching, access pages, employee views, and RLS verification scripts.",
      nextAction: "Run RLS verification and test an employee login before giving real staff access.",
      href: "/app/access"
    },
    {
      question: "Are payments honest and safe?",
      status: stripeReady ? "watch" : "needs_work",
      answer: "Subscription checkout can be live when Stripe env and webhooks are ready. Managed payouts must stay limited until Connect, disputes, refunds, and fee rules are tested.",
      proof: stripeReady ? "Stripe subscription readiness reports ready." : "Stripe readiness is not fully ready in workspace billing checks.",
      nextAction: connectReady ? "Run small live tests for checkout, webhook, refund, and payout paths." : "Keep managed payouts marked as not public until Connect QA is complete.",
      href: "/app/billing"
    },
    {
      question: "Can customers tell what is included, gated, or upgrade-only?",
      status: "watch",
      answer: "Pricing and feature readiness describe starter, growth, pro, managed, connected, and provider-gated work.",
      proof: "Plan limits, billing overview, and feature readiness surfaces exist.",
      nextAction: "Before launch, compare pricing page promises line by line against this audit.",
      href: "/pricing"
    },
    {
      question: "Is marketing/SEO legitimate instead of generic AI sludge?",
      status: "watch",
      answer: "The safe model is proof-led: real services, real locations, reviews, photos, customer proof, source tracking, and approval before publishing.",
      proof: "SEO/content drafts, proof capture, authority engine, publishing queue, and marketing OS are separate from live publishing gates.",
      nextAction: "Require proof, service area, offer, source, and approval metadata for every public campaign.",
      href: "/app/authority"
    },
    {
      question: "Can photos, receipts, videos, and proof become useful business records?",
      status: "watch",
      answer: "Proof, receipt, walkthrough, marketing creative, and estimator media paths exist. Premium media generation still depends on provider keys and cost controls.",
      proof: "Feature readiness includes proof, marketing creative, AI walkthrough, and estimator media paths.",
      nextAction: "Keep video generation described as briefs/creative prep until a video provider is connected and cost-capped.",
      href: "/app/marketing-os"
    },
    {
      question: "Will owners get their life back, or will Ferocity create more chores?",
      status: "watch",
      answer: "The product now has owner command, needs-attention queues, daily briefs, alerts, AI office manager, and command input. That is the right direction, but it must be tested with real daily use.",
      proof: `${counts.ownerEvents} owner event(s), ${counts.pushSubscriptions} active push subscription(s), and attention/briefing pages are available.`,
      nextAction: "Use Ferocity on one real business for a week and record every time the owner still had to hunt for something.",
      href: "/app/attention-command"
    },
    {
      question: "Can outside platforms feed into one command center?",
      status: counts.ownerEvents > 0 ? "strong" : "watch",
      answer: "Owner event intake and connected-system pages exist for MarketplacePro, 4Bid, GovFlow/BidOps, GuardianSignal, and other systems.",
      proof: `${counts.ownerEvents} owner command event(s) stored in this workspace.`,
      nextAction: "Verify each platform posts with the correct URL, bearer token, tenant ID, and event payload.",
      href: "/app/owner-command-center"
    },
    {
      question: "Are expensive AI features isolated from normal AI work?",
      status: "watch",
      answer: "AI provider settings, usage events, budget policies, and AI cost controls exist. Normal AI should feel available; premium media should be capped.",
      proof: "AI Cost Controls is linked in Settings and the schema has provider configs, usage, and budget policies.",
      nextAction: "Keep video, large image batches, voice, and premium models behind limits until provider pricing is confirmed.",
      href: "/app/ai-control"
    },
    {
      question: "What should block launch?",
      status: featureCounts.connection > 8 ? "needs_work" : "watch",
      answer: "Launch should be blocked only by auth, privacy, billing, broken signup, broken core workflows, or misleading public claims. Missing optional providers should not block a controlled launch.",
      proof: `${featureCounts.connection} feature(s) still need provider connection; core readiness is tracked separately.`,
      nextAction: "Run the verification suite and only deploy after public copy, signup, billing, and core workflows pass.",
      href: "/app/go-live"
    }
  ];

  const strong = questions.filter((item) => item.status === "strong").length;
  const watch = questions.filter((item) => item.status === "watch").length;
  const needsWork = questions.filter((item) => item.status === "needs_work").length;
  const blocked = questions.filter((item) => item.status === "blocked").length;
  const score = Math.round((questions.reduce((total, item) => total + scoreFor(item.status), 0) / questions.length) * 100);

  return {
    score,
    strong,
    watch,
    needsWork,
    blocked,
    counts,
    questions
  };
}
