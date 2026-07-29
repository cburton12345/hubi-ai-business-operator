"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { saveScopedPreference } from "@/lib/preferences/saved-preferences";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  contactKey: z.string().min(2).max(200),
  returnPath: z.string().startsWith("/app/"),
  preferredLanguage: z.string().max(50),
  preferredMethod: z.enum(["automatic_sms", "native_sms", "google_voice", "email", "ai_voice_call", "human_call"]),
  quietHoursStart: z.string().max(10),
  quietHoursEnd: z.string().max(10),
  bestContactTime: z.string().max(100),
  preferredEmployee: z.string().max(120),
  department: z.string().max(120)
});

export async function saveContactCommunicationPreferenceAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = schema.safeParse({
    contactKey: formData.get("contactKey"),
    returnPath: formData.get("returnPath"),
    preferredLanguage: formData.get("preferredLanguage") ?? "",
    preferredMethod: formData.get("preferredMethod"),
    quietHoursStart: formData.get("quietHoursStart") ?? "",
    quietHoursEnd: formData.get("quietHoursEnd") ?? "",
    bestContactTime: formData.get("bestContactTime") ?? "",
    preferredEmployee: formData.get("preferredEmployee") ?? "",
    department: formData.get("department") ?? ""
  });
  if (!parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  await saveScopedPreference({
    tenantId,
    domain: "communication",
    key: "contact_profile",
    scope: { type: "contact", key: parsed.data.contactKey },
    value: {
      preferredLanguage: parsed.data.preferredLanguage || "auto",
      preferredMethod: parsed.data.preferredMethod,
      callBeforeTexting: formData.get("callBeforeTexting") === "on",
      noMarketingTexts: formData.get("noMarketingTexts") === "on",
      noAiCalls: formData.get("noAiCalls") === "on",
      quietHoursStart: parsed.data.quietHoursStart,
      quietHoursEnd: parsed.data.quietHoursEnd,
      bestContactTime: parsed.data.bestContactTime,
      preferredEmployee: parsed.data.preferredEmployee,
      department: parsed.data.department
    },
    userId: session?.userId,
    metadata: { changedInline: true, returnPath: parsed.data.returnPath }
  });
  revalidatePath(parsed.data.returnPath);
}
