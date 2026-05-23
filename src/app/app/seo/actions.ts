"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { generateSeoAutopilotDrafts } from "@/lib/seo/seo-autopilot";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function generateSeoAutopilotAction() {
  await requirePermission("ai:queue");
  await generateSeoAutopilotDrafts(await getCurrentWorkspaceId());

  revalidatePath("/app");
  revalidatePath("/app/seo");
  revalidatePath("/app/calendar");
  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
}
