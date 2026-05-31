import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type BrandChannelRow = {
  id: string;
  name: string;
  business_model: string;
  industry: string | null;
  vertical: string | null;
};

export type ChannelPlaybookRow = {
  brandId: string;
  brandName: string;
  pathName: string;
  summary: string;
  startWith: string[];
  useLater: string[];
  avoidAtFirst: string[];
  proofToTrack: string[];
};

function text(row: BrandChannelRow) {
  return `${row.business_model} ${row.industry ?? ""} ${row.vertical ?? ""} ${row.name}`.toLowerCase();
}

function playbookFor(row: BrandChannelRow): Omit<ChannelPlaybookRow, "brandId" | "brandName"> {
  const profile = text(row);

  if (profile.includes("roof") || profile.includes("storm") || profile.includes("restoration")) {
    return {
      pathName: "Storm and local service growth",
      summary: "Start with local proof, review velocity, useful city/service pages, Facebook visibility, and fast follow-up before heavy ad spend.",
      startWith: ["Local SEO pages", "Google Maps reviews", "Facebook posts and groups", "Storm/seasonal offers", "Rapid estimate follow-up"],
      useLater: ["Google Ads", "Retargeting", "GBP post automation", "Call tracking"],
      avoidAtFirst: ["Large paid search budgets before reviews and landing pages are strong", "Generic AI storm posts", "Thin city pages without service proof"],
      proofToTrack: ["City pages that create booked inspections", "Review requests sent after completed jobs", "Facebook leads that become estimates", "Speed to first reply"]
    };
  }

  if (profile.includes("trailer") || profile.includes("rental") || row.business_model === "rental") {
    return {
      pathName: "Rental demand and community presence",
      summary: "Start where renters already browse: marketplace-style listings, Facebook Marketplace/groups, simple offers, availability, and fast quote response.",
      startWith: ["Facebook Marketplace", "Local Facebook groups", "Rental offer pages", "Availability posts", "Quote follow-up"],
      useLater: ["Paid social tests", "Search ads for high-intent rental terms", "Retargeting", "Partner/referral campaigns"],
      avoidAtFirst: ["Broad paid ads without availability and pricing clarity", "Overbuilt SEO before core rental pages exist"],
      proofToTrack: ["Which group/listing creates real bookings", "Quote response time", "Repeat renters", "Rental page conversion"]
    };
  }

  if (profile.includes("software") || profile.includes("saas") || row.business_model === "software") {
    return {
      pathName: "SaaS authority and outbound loop",
      summary: "Start with useful SEO, demos, product education, YouTube-style explainers, cold outreach, and nurture instead of assuming paid ads will teach the market.",
      startWith: ["Problem-led SEO", "YouTube or demo content", "Cold outreach", "AI-assisted nurture", "Case-study pages"],
      useLater: ["Paid search on proven keywords", "LinkedIn retargeting", "Partner programs", "Webinar funnels"],
      avoidAtFirst: ["Paid ads before message-market fit is clear", "Generic blog volume without product proof"],
      proofToTrack: ["Topics that create demos", "Outreach replies", "Trial to customer conversion", "Content-assisted revenue"]
    };
  }

  if (row.business_model === "marketplace") {
    return {
      pathName: "Marketplace liquidity loop",
      summary: "Start by balancing supply and demand: useful listing pages, provider profiles, saved searches, alerts, community channels, and lead response.",
      startWith: ["Provider/listing SEO", "Community posting", "Saved search alerts", "Provider follow-up", "Referral loops"],
      useLater: ["Paid acquisition by category", "Retargeting", "Sponsored listings", "Partner distribution"],
      avoidAtFirst: ["Buying traffic before listings and response quality are strong", "Duplicate vendor setup across products"],
      proofToTrack: ["Listing views to contact requests", "Provider response rate", "Saved search activity", "Repeat category demand"]
    };
  }

  return {
    pathName: "Local growth before paid spend",
    summary: "Start with the compounding basics: useful pages, reviews, referrals, community presence, lead capture, and follow-up before scaling paid channels.",
    startWith: ["Organic SEO", "Review requests", "Referral asks", "Community posting", "Lead follow-up"],
    useLater: ["Google Ads", "Paid social", "Retargeting", "Provider publishing"],
    avoidAtFirst: ["Big ad spend before tracking and follow-up are working", "Generic AI content", "Unreviewed public publishing"],
    proofToTrack: ["Leads by source", "Booked jobs by service", "Reviews gained", "Follow-up timing", "Revenue by channel"]
  };
}

export async function getChannelPlaybooks(): Promise<ChannelPlaybookRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<BrandChannelRow>(
    `
    select id, name, business_model, industry, vertical
    from public.brands
    where tenant_id = $1 and status = 'active'
    order by name
    limit 8
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    brandId: row.id,
    brandName: row.name,
    ...playbookFor(row)
  }));
}
