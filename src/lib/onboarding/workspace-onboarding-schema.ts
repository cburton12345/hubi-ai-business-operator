import { z } from "zod";

export const workspaceOnboardingSchema = z.object({
  organizationName: z.string().min(2).max(160),
  workspaceSlug: z.string().max(120).optional(),
  brandName: z.string().min(2).max(160),
  businessModel: z.enum(["local_service", "rental", "software", "marketplace", "lead_generation"]),
  domain: z.string().max(240).optional(),
  phone: z.string().max(80).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  industry: z.string().max(160).optional(),
  vertical: z.string().max(120).optional(),
  primaryLocation: z.string().max(160).optional(),
  primaryGoal: z.string().max(500).optional(),
  description: z.string().max(1200).optional(),
  targetCustomers: z.string().max(1200).optional(),
  ctaGoals: z.string().max(600).optional(),
  toneOfVoice: z.string().max(600).optional(),
  adGoals: z.string().max(600).optional(),
  reviewStrategy: z.string().max(600).optional(),
  followUpStrategy: z.string().max(600).optional(),
  riskProfile: z.enum(["normal", "regulated", "legal_sensitive"]),
  approvalMode: z.enum(["manual", "low_risk_auto", "recommend_only"]),
  services: z.string().max(2000).optional(),
  serviceAreas: z.string().max(2000).optional(),
  offers: z.string().max(2000).optional(),
  seoKeywords: z.string().max(2000).optional(),
  landingPages: z.string().max(2000).optional(),
  autoCreateLowRiskDrafts: z.boolean(),
  autoWeeklySeoPosts: z.boolean(),
  autoGbpPostDrafts: z.boolean(),
  autoFacebookPostDrafts: z.boolean(),
  autoReviewRequestDrafts: z.boolean(),
  autoFollowUpDrafts: z.boolean(),
  autoLandingPageSuggestions: z.boolean()
});

export type WorkspaceOnboardingInput = z.infer<typeof workspaceOnboardingSchema>;

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function emptyToNull(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

export function parseLines(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function parseNameDescriptionLines(value: string | undefined) {
  return parseLines(value).map((line) => {
    const [name, ...rest] = line.split(" - ");
    return {
      name: name.trim(),
      description: rest.join(" - ").trim() || null
    };
  });
}
