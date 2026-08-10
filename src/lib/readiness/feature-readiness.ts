import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getServiceControls, type ServiceControl } from "@/lib/controls/get-service-controls";
import { getIntegrationRows, type IntegrationRow } from "@/lib/integrations/get-integrations";

export type FeatureReadinessState = "live_now" | "needs_connection" | "approval_first" | "higher_plan";

export type FeatureReadinessItem = {
  title: string;
  area: string;
  state: FeatureReadinessState;
  plainStatus: string;
  whatWorks: string;
  whatIsBlocked: string;
  nextStep: string;
  href: string;
};

function labelForState(state: FeatureReadinessState) {
  if (state === "live_now") return "Live now";
  if (state === "needs_connection") return "Optional connection";
  if (state === "approval_first") return "Review before action";
  if (state === "higher_plan") return "Higher plan";
  return "Needs plan or connection";
}

function serviceState(input: {
  mode?: string;
  planAllowed?: boolean;
  providerReady?: boolean;
  defaultWhenOn?: FeatureReadinessState;
}): FeatureReadinessState {
  if (input.planAllowed === false) return "higher_plan";
  if (input.providerReady === false) return "needs_connection";
  if (input.mode === "enabled") return input.defaultWhenOn ?? "live_now";
  if (input.mode === "review_required" || input.mode === "draft_only") return "approval_first";
  return "approval_first";
}

function item(input: Omit<FeatureReadinessItem, "plainStatus">): FeatureReadinessItem {
  return {
    ...input,
    plainStatus: labelForState(input.state)
  };
}

export async function getFeatureReadinessItems() {
  const [controls, integrations, billing] = await Promise.all([getServiceControls(), getIntegrationRows(), getBillingOverview()]);
  const controlByKey = new Map<string, ServiceControl>(controls.controls.map((control) => [control.featureKey, control]));
  const integrationByProvider = new Map<string, IntegrationRow>(integrations.map((integration) => [integration.provider, integration]));
  const hasReady = (provider: string) => {
    const integration = integrationByProvider.get(provider);
    return Boolean(integration && (integration.status === "connected" || integration.credentialsStatus === "configured" || integration.liveActionsEnabled));
  };
  const controlState = (featureKey: string, providerReady?: boolean, defaultWhenOn?: FeatureReadinessState) => {
    const control = controlByKey.get(featureKey);
    return serviceState({
      mode: control?.mode,
      planAllowed: control?.planAllowed,
      providerReady,
      defaultWhenOn
    });
  };

  const subscriptionLive = billing.readiness.some((row) => row.label.toLowerCase().includes("stripe") && row.status === "ready");
  const connectReady = billing.readiness.some((row) => row.label.toLowerCase().includes("connect managed") && row.status === "ready");

  return [
    item({
      title: "Lead capture and source tracking",
      area: "Leads",
      state: controlState("lead_capture", true, "live_now"),
      whatWorks: "Public forms, website helper paths, lead records, source fields, UTM/referrer context, and lead queues.",
      whatIsBlocked: "No paid ad or external platform data appears until those platforms are connected or events are sent in.",
      nextStep: "Connect the website or create the first public form.",
      href: "/app/customer-touchpoints"
    }),
    item({
      title: "Automatic website setup",
      area: "Setup",
      state: controlState("website_import", true, "approval_first"),
      whatWorks: "Ferocity can scan a public website, extract business facts, create profile data, and build a safe setup plan.",
      whatIsBlocked: "It does not publish, spend, send, or change the customer website without approval.",
      nextStep: "Paste the business website and run Auto-Build From The Website.",
      href: "/app/build-system"
    }),
    item({
      title: "AI lead and follow-up agents",
      area: "AI Workforce",
      state: controlState("follow_up_recovery", true, "approval_first"),
      whatWorks: "AI agents create first-response drafts, stale lead tasks, follow-up workflows, owner alerts, and timeline logs.",
      whatIsBlocked: "Customer-visible sends stay gated by approval, consent, provider readiness, and plan limits.",
      nextStep: "Run AI Workforce and review prepared actions.",
      href: "/app/ai-workforce"
    }),
    item({
      title: "Email notifications",
      area: "Communication",
      state: hasReady("resend_shared") || hasReady("email_provider") ? "approval_first" : "needs_connection",
      whatWorks: "Resend can send transactional/internal notifications when configured, and inbound routes can record replies.",
      whatIsBlocked: "Bulk or customer-facing email still requires templates, approval, consent, and limits.",
      nextStep: "Check Resend/domain status and approved templates.",
      href: "/app/integrations"
    }),
    item({
      title: "Push notifications",
      area: "Notifications",
      state: "live_now",
      whatWorks: "Users can subscribe devices, send test pushes, and receive important owner-event alerts when VAPID keys are configured.",
      whatIsBlocked: "No push reaches a device until the user installs/allows notifications.",
      nextStep: "Open Notifications and send a test.",
      href: "/app/notifications"
    }),
    item({
      title: "SEO and content drafts",
      area: "Growth",
      state: controlState("seo_autopilot", true, "approval_first"),
      whatWorks: "Ferocity prepares SEO tasks, service/city page drafts, content ideas, source tracking, and proof-based drafts.",
      whatIsBlocked: "No thin city pages or public publishing should go live without proof, review, and approval.",
      nextStep: "Generate drafts from real services, locations, and customer proof.",
      href: "/app/growth-calendar"
    }),
    item({
      title: "Customer proof and review requests",
      area: "Reputation",
      state: controlState("review_requests", true, "approval_first"),
      whatWorks: "Proof links, review workflows, consent tracking, before/after assets, and draft marketing reuse exist.",
      whatIsBlocked: "Live review-platform monitoring and public responses need provider connections.",
      nextStep: "Create proof links after completed work and review submissions.",
      href: "/app/proof"
    }),
    item({
      title: "Google Business Profile",
      area: "Marketing Platforms",
      state: hasReady("google_business_profile") ? "approval_first" : "needs_connection",
      whatWorks: "Ferocity can draft GBP ideas and track the work internally.",
      whatIsBlocked: "Live GBP publishing, profile updates, and review ingestion need Google OAuth/permissions.",
      nextStep: "Add Google OAuth credentials and connect the workspace profile.",
      href: "/app/integrations"
    }),
    item({
      title: "Paid ad platforms",
      area: "Marketing Platforms",
      state: hasReady("google_ads") || hasReady("facebook") || hasReady("reddit") ? "approval_first" : "needs_connection",
      whatWorks: "Ferocity can plan campaigns, track sources, and prepare ad ideas.",
      whatIsBlocked: "Live ad creation, budget changes, and spend need Google/Meta/Reddit/Microsoft/Yahoo credentials and approval.",
      nextStep: "Connect an ad account when ready. Ferocity applies safety boundaries automatically; custom limits are optional.",
      href: "/app/integrations"
    }),
    item({
      title: "Photo ads, graphics, and AI video briefs",
      area: "Marketing Creative",
      state: controlState("marketing_graphics", true, "approval_first"),
      whatWorks: "Ferocity can prepare review graphics, before/after graphics, image ad briefs, short video scripts, scene lists, voiceover drafts, and CTAs.",
      whatIsBlocked: "Live AI image/video provider generation and public publishing need provider keys, brand approval, usage limits, and review.",
      nextStep: "Open Marketing OS and create a graphic job, video job, or Content Studio campaign.",
      href: "/app/marketing-os"
    }),
    item({
      title: "Jobs, bids, invoices, materials, receipts",
      area: "Operations",
      state: "live_now",
      whatWorks: "Customers, jobs, estimates, invoices, material lists, manual payments, receipts, reimbursements, and job profit tracking are available.",
      whatIsBlocked: "Nothing here requires QuickBooks. Optional two-way accounting sync still needs the chosen provider's authorization.",
      nextStep: "Use Jobs & Money for simple paid-tier operations.",
      href: "/app/job-tracker"
    }),
    item({
      title: "Schedule and calendar subscriptions",
      area: "Operations",
      state: "live_now",
      whatWorks: "Scheduling, dispatch, customer confirmations, conflict checks, and private revocable iCalendar feeds work without Google or Microsoft developer credentials.",
      whatIsBlocked: "Nothing blocks Ferocity scheduling. Optional two-way edits inside an outside calendar require that provider's authorization.",
      nextStep: "Create a private calendar feed from Schedule and subscribe from the calendar the business already uses.",
      href: "/app/schedule"
    }),
    item({
      title: "Subscription billing",
      area: "Payments",
      state: subscriptionLive ? "live_now" : "needs_connection",
      whatWorks: "Stripe checkout prices and webhooks are configured for Ferocity subscriptions.",
      whatIsBlocked: "Stripe account review or missing env/webhook would block live processing.",
      nextStep: "Run a live low-dollar checkout before broad launch.",
      href: "/app/billing"
    }),
    item({
      title: "Customer invoice payment links",
      area: "Payments",
      state: "approval_first",
      whatWorks: "Invoices, manual payment records, payment events, and ledgers exist.",
      whatIsBlocked: "Customer-owned Stripe links or Connect routing must be verified before selling as automatic collection.",
      nextStep: "Use manual tracking now; test connected Stripe payment flow before customer rollout.",
      href: "/app/cash-collection"
    }),
    item({
      title: "Ferocity-managed payouts",
      area: "Payments",
      state: connectReady ? "approval_first" : "needs_connection",
      whatWorks: "Stripe Connect foundation and onboarding route exist.",
      whatIsBlocked: "Payout reconciliation, fee disclosure, refunds, disputes, chargebacks, bank returns, and support rules need final live testing.",
      nextStep: "Do not offer this publicly until Connect QA passes.",
      href: "/app/billing"
    }),
    item({
      title: "MarketplacePro, 4Bid, and owner events",
      area: "Connected Systems",
      state: "live_now",
      whatWorks: "Token-protected owner event intake stores events, triages importance, updates connection status, and can trigger push alerts.",
      whatIsBlocked: "Each outside platform must send the correct bearer token and tenant ID.",
      nextStep: "Use the LifeOps/Connected Systems page to pause, disconnect, or add systems.",
      href: "/app/lifeops-connections"
    }),
    item({
      title: "Generic webhooks",
      area: "Integrations",
      state: "live_now",
      whatWorks: "Inbound token-protected webhooks queue events by workspace.",
      whatIsBlocked: "Outbound destructive actions are intentionally disabled until reviewed.",
      nextStep: "Create an inbound endpoint and test with curl/PowerShell.",
      href: "/app/webhooks"
    }),
    item({
      title: "AI Office Manager and voice readiness",
      area: "Communication",
      state: controlState("ai_office_manager", hasReady("voice_ai"), "approval_first"),
      whatWorks: "The Office Manager can organize reception, customer service, scheduling, follow-up, collections, owner commands, app alerts, email drafts, manual text drafts, and action logs.",
      whatIsBlocked: "Live phone answering or outbound voice needs a voice provider, number routing, consent/recording rules, approval gates, and budget controls.",
      nextStep: "Open Office Manager, keep live voice disabled until provider setup is complete, and use push/email/manual drafts now.",
      href: "/app/office-manager"
    })
  ] satisfies FeatureReadinessItem[];
}
