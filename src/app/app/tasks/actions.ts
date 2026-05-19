"use server";

import { revalidatePath } from "next/cache";
import { queueWeeklyAiTasks } from "@/lib/ai/queue-weekly-tasks";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function queueWeeklyAiTasksAction() {
  await requirePermission("ai:queue");

  await queueWeeklyAiTasks(await getCurrentWorkspaceId());
  revalidatePath("/app/tasks");
}
