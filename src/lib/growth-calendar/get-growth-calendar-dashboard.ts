import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getMarketingOsDashboard, type MarketingOsRow } from "@/lib/marketing-os/get-marketing-os-dashboard";
import { getPublishingHubDashboard, type PublishingHubDraft } from "@/lib/publishing-hub/get-publishing-hub";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { getProofDashboard } from "@/lib/ugc/proof";

export type GrowthCalendarWorkstream = {
  title: string;
  plainGoal: string;
  status: string;
  href: string;
  count: number;
};

export type GrowthCalendarAction = {
  title: string;
  detail: string;
  href: string;
  urgency: "low" | "medium" | "high";
};

export type GrowthCalendarDashboard = {
  metrics: {
    seoDrafts: number;
    publishingItems: number;
    reviewRequests: number;
    proofNeedsReview: number;
    campaigns: number;
    websiteImports: number;
    mediaAssets: number;
    graphicVideoJobs: number;
  };
  actions: GrowthCalendarAction[];
  workstreams: GrowthCalendarWorkstream[];
  drafts: PublishingHubDraft[];
  campaigns: MarketingOsRow[];
  websiteImports: MarketingOsRow[];
  outputs: MarketingOsRow[];
};

export async function getGrowthCalendarDashboard(): Promise<GrowthCalendarDashboard> {
  const [publishing, marketing, proof, billing, reports] = await Promise.all([
    getPublishingHubDashboard(),
    getMarketingOsDashboard(),
    getProofDashboard(),
    getBillingOverview(),
    getReportingDashboard()
  ]);

  const graphicVideoJobs = marketing.metrics.graphicJobs + marketing.metrics.videoJobs;
  const metrics = {
    seoDrafts: publishing.metrics.seoDrafts || billing.usage.seoDraftsThisMonth,
    publishingItems: publishing.metrics.scheduledOrApproved || billing.usage.publishingQueueItems,
    reviewRequests: billing.usage.reviewRequestsThisMonth || reports.reputation.reviewRequests,
    proofNeedsReview: proof.metrics.needsReview,
    campaigns: marketing.metrics.campaigns,
    websiteImports: marketing.metrics.websiteImports,
    mediaAssets: marketing.metrics.mediaAssets,
    graphicVideoJobs
  };

  const actions: GrowthCalendarAction[] = [
    metrics.proofNeedsReview > 0
      ? {
          title: "Review customer proof",
          detail: `${metrics.proofNeedsReview} proof item${metrics.proofNeedsReview === 1 ? "" : "s"} need a human check before they become marketing.`,
          href: "/app/proof",
          urgency: "high"
        }
      : {
          title: "Ask for customer proof",
          detail: "Turn finished jobs into photos, testimonials, review prompts, and local content.",
          href: "/app/proof",
          urgency: "medium"
        },
    metrics.seoDrafts > 0
      ? {
          title: "Review SEO drafts",
          detail: `${metrics.seoDrafts} SEO draft${metrics.seoDrafts === 1 ? "" : "s"} are ready to become useful website or hosted page work.`,
          href: "/app/publishing-hub",
          urgency: "medium"
        }
      : {
          title: "Create useful SEO drafts",
          detail: "Start with real services, towns, completed jobs, and customer proof instead of thin pages.",
          href: "/app/seo",
          urgency: "medium"
        },
    metrics.publishingItems > 0
      ? {
          title: "Check scheduled publishing",
          detail: `${metrics.publishingItems} item${metrics.publishingItems === 1 ? "" : "s"} are queued, scheduled, or waiting on review.`,
          href: "/app/calendar",
          urgency: "medium"
        }
      : {
          title: "Plan this week's posts and pages",
          detail: "Put GBP posts, social drafts, review asks, and page refreshes on the calendar.",
          href: "/app/calendar",
          urgency: "low"
        },
    metrics.websiteImports > 0
      ? {
          title: "Use website findings",
          detail: "Website imports are available. Turn the gaps into page updates, forms, and campaign ideas.",
          href: "/app/marketing-os",
          urgency: "low"
        }
      : {
          title: "Connect or review the website",
          detail: "Ferocity needs the current site context before it can make the best SEO and conversion plan.",
          href: "/app/website",
          urgency: "medium"
        },
    reports.channelRoi.length > 0
      ? {
          title: "Double down on what produced revenue",
          detail: "Channel ROI data exists. Use it to decide which pages, campaigns, and follow-ups deserve attention.",
          href: "/app/reports",
          urgency: "low"
        }
      : {
          title: "Track lead sources",
          detail: "Make sure forms, pages, campaigns, referrals, and MarketplacePro leads keep source and service context.",
          href: "/app/growth",
          urgency: "medium"
        }
  ];

  const workstreams: GrowthCalendarWorkstream[] = [
    {
      title: "Get Found",
      plainGoal: "Service pages, city pages, website fixes, Google Business ideas, and search content.",
      status: metrics.seoDrafts > 0 ? "drafts ready" : "needs plan",
      href: "/app/seo",
      count: metrics.seoDrafts
    },
    {
      title: "Prove Trust",
      plainGoal: "Reviews, customer photos, before/after proof, testimonials, and permission tracking.",
      status: metrics.proofNeedsReview > 0 ? "needs review" : "ready to collect",
      href: "/app/proof",
      count: metrics.proofNeedsReview
    },
    {
      title: "Publish Work",
      plainGoal: "Calendar items, website pages, hosted pages, GBP drafts, social posts, and exports.",
      status: metrics.publishingItems > 0 ? "queued" : "needs schedule",
      href: "/app/calendar",
      count: metrics.publishingItems
    },
    {
      title: "Create Campaigns",
      plainGoal: "Organic campaigns, offer ideas, graphics, video briefs, emails, and social content.",
      status: metrics.campaigns > 0 ? "active" : "needs campaign",
      href: "/app/marketing-os",
      count: metrics.campaigns + graphicVideoJobs
    },
    {
      title: "Ask For Reviews",
      plainGoal: "Request reviews after completed work and catch bad experiences before they go public.",
      status: metrics.reviewRequests > 0 ? "running" : "needs workflow",
      href: "/app/review",
      count: metrics.reviewRequests
    },
    {
      title: "Measure ROI",
      plainGoal: "Connect source, page, service, city, lead, job, invoice, review, and revenue.",
      status: reports.channelRoi.length > 0 ? "has data" : "needs tracking",
      href: "/app/reports",
      count: reports.channelRoi.length
    }
  ];

  return {
    metrics,
    actions,
    workstreams,
    drafts: publishing.drafts.slice(0, 6),
    campaigns: marketing.campaigns.slice(0, 5),
    websiteImports: marketing.websiteImports.slice(0, 5),
    outputs: marketing.outputs.slice(0, 6)
  };
}
