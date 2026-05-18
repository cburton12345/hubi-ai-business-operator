import type { ApprovalQueueRow, DraftQueueRow, RecommendationQueueRow, TaskQueueRow } from "@/lib/queues/get-queue-data";

const now = new Date().toISOString();

export const demoTaskRows: TaskQueueRow[] = [
  {
    id: "task-weekly-drafts",
    brandName: "Internal Portfolio",
    type: "content_draft",
    title: "Generate weekly content drafts",
    status: "queued",
    priority: 5,
    createdAt: now
  },
  {
    id: "task-seo-recommendations",
    brandName: "Storm Restoration",
    type: "seo_recommendation",
    title: "Recommend roofing service-area SEO priorities",
    status: "queued",
    priority: 3,
    createdAt: now
  },
  {
    id: "task-ferocity-campaigns",
    brandName: "Ferocity",
    type: "campaign_recommendation",
    title: "Draft compliant personal injury campaign angles",
    status: "queued",
    priority: 4,
    createdAt: now
  }
];

export const demoDraftRows: DraftQueueRow[] = [
  {
    id: "draft-ferocity-intake",
    brandName: "Ferocity",
    contentType: "landing_page",
    title: "Personal injury intake page draft",
    status: "needs_review",
    riskLevel: "high",
    createdAt: now
  },
  {
    id: "draft-trailer-facebook",
    brandName: "Preferred Trailer Rental",
    contentType: "facebook_post",
    title: "Weekend trailer rental availability post",
    status: "needs_review",
    riskLevel: "low",
    createdAt: now
  }
];

export const demoRecommendationRows: RecommendationQueueRow[] = [
  {
    id: "rec-storm-city-pages",
    brandName: "Storm Restoration",
    category: "seo",
    title: "Prioritize storm restoration city pages",
    summary: "Start with service-area pages for highest-intent local roofing searches.",
    status: "open",
    riskLevel: "medium",
    impactEstimate: "high",
    effortEstimate: "medium",
    createdAt: now
  },
  {
    id: "rec-ferocity-guardrails",
    brandName: "Ferocity",
    category: "content",
    title: "Require approval for legal-sensitive public copy",
    summary: "Keep no-legal-advice and no-guarantee guardrails attached to all Ferocity drafts.",
    status: "open",
    riskLevel: "high",
    impactEstimate: "high",
    effortEstimate: "low",
    createdAt: now
  }
];

export const demoApprovalRows: ApprovalQueueRow[] = [
  {
    id: "approval-ferocity-page",
    brandName: "Ferocity",
    targetType: "ai_draft",
    status: "pending",
    riskLevel: "high",
    notes: "Review legal-sensitive wording before publishing.",
    createdAt: now
  },
  {
    id: "approval-storm-seo",
    brandName: "Storm Restoration",
    targetType: "recommendation",
    status: "pending",
    riskLevel: "medium",
    notes: "Confirm city/service priority before task creation.",
    createdAt: now
  }
];
