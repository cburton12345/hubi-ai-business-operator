import { z } from "zod";

export const brandProfileUpdateSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().min(1).max(160),
  domain: z.string().max(240).optional(),
  phone: z.string().max(80).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  logoUrl: z.union([z.string().url(), z.literal("")]).optional(),
  industry: z.string().max(160).optional(),
  vertical: z.string().max(120).optional(),
  description: z.string().max(1200).optional(),
  primaryGoal: z.string().max(400).optional(),
  primaryLocation: z.string().max(160).optional(),
  riskProfile: z.enum(["normal", "regulated", "legal_sensitive"]),
  status: z.enum(["active", "paused", "archived"]),
  targetCustomers: z.string().max(1200).optional(),
  ctaGoals: z.string().max(600).optional(),
  adGoals: z.string().max(600).optional(),
  seoTargets: z.string().max(600).optional(),
  reviewStrategy: z.string().max(600).optional(),
  followUpStrategy: z.string().max(600).optional(),
  toneOfVoice: z.string().max(600).optional(),
  approvalMode: z.enum(["manual", "low_risk_auto", "recommend_only"])
});

export type BrandProfileUpdateInput = z.infer<typeof brandProfileUpdateSchema>;

export function emptyToNull(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}
