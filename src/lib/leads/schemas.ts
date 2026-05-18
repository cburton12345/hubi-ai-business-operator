import { z } from "zod";

export const publicLeadSchema = z.object({
  formPublicKey: z.string().min(8),
  source: z.string().max(120).optional(),
  sourceDetail: z.string().max(240).optional(),
  name: z.string().max(160).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  message: z.string().max(4000).optional(),
  leadType: z
    .enum(["general", "appointment", "quote", "demo", "buyer", "seller", "rental_request", "case_intake"])
    .default("general"),
  consentToContact: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).default({})
});

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;
