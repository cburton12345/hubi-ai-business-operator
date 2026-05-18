import type { BrandSummary, RecommendationSummary, TaskSummary } from "@/types/core";

export const internalBrands: BrandSummary[] = [
  {
    name: "4bid",
    slug: "4bid",
    businessModel: "marketplace",
    industry: "Auction marketplace",
    primaryGoal: "Generate buyer, seller, bidder, and consignor demand.",
    riskProfile: "normal"
  },
  {
    name: "MarketplacePro",
    slug: "marketplacepro",
    businessModel: "software",
    industry: "Property management software",
    primaryGoal: "Drive demos and nurture property management operators.",
    riskProfile: "normal"
  },
  {
    name: "Preferred Trailer Rental",
    slug: "preferred-trailer-rental",
    businessModel: "rental",
    industry: "Trailer rental",
    primaryGoal: "Capture rental quote requests and local service demand.",
    riskProfile: "normal"
  },
  {
    name: "CaseFlow",
    slug: "caseflow",
    businessModel: "lead_generation",
    industry: "Personal injury lead generation",
    primaryGoal: "Generate qualified, consent-based personal injury leads.",
    riskProfile: "legal_sensitive"
  }
];

export const starterRecommendations: RecommendationSummary[] = [
  {
    title: "Create weekly draft queue",
    summary: "Generate one SEO draft, one social post, and one campaign idea per active brand.",
    riskLevel: "low"
  },
  {
    title: "Mark CaseFlow copy as legal-sensitive",
    summary: "Require review for public-facing legal claims and intake language.",
    riskLevel: "high"
  },
  {
    title: "Normalize lead forms by business model",
    summary: "Use detail tables for rental, marketplace, software, service, and legal intake fields.",
    riskLevel: "medium"
  }
];

export const starterTasks: TaskSummary[] = [
  {
    title: "Generate internal portfolio content drafts",
    type: "content_draft",
    status: "queued"
  },
  {
    title: "Recommend SEO priorities by brand",
    type: "seo_recommendation",
    status: "queued"
  },
  {
    title: "Recommend campaign angles by business model",
    type: "campaign_recommendation",
    status: "queued"
  }
];
