export type BusinessModel = "local_service" | "rental" | "software" | "marketplace" | "lead_generation";

export type RiskProfile = "normal" | "regulated" | "legal_sensitive";

export type RiskLevel = "low" | "medium" | "high";

export type PlatformRole = "super_admin" | "support" | "user";

export type TenantRole = "owner" | "admin" | "operator" | "viewer";

export type BrandSummary = {
  name: string;
  slug: string;
  businessModel: BusinessModel;
  industry: string;
  primaryGoal: string;
  riskProfile: RiskProfile;
};

export type RecommendationSummary = {
  title: string;
  summary: string;
  riskLevel: RiskLevel;
};

export type TaskSummary = {
  title: string;
  type: string;
  status: string;
};
