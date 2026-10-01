import { z } from "zod";

export const ferocityConnectInboundMessageSchema = z.object({
  eventId: z.string().min(8).max(160),
  // Carrier short codes are commonly five or six digits. Alphanumeric sender
  // IDs can be even shorter in some regions, so accept any non-empty sender
  // while retaining the existing length ceiling.
  sender: z.string().trim().min(1).max(32),
  recipient: z.string().max(32).nullable().optional(),
  body: z.string().max(5000),
  receivedAt: z.string().datetime(),
  subscriptionId: z.number().int().nullable().optional()
});
