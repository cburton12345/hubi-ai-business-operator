"use server";

import { revalidatePath } from "next/cache";
import { queueWeeklyAiTasks } from "@/lib/ai/queue-weekly-tasks";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function queueWeeklyAiTasksAction() {
  await queueWeeklyAiTasks(await getCurrentWorkspaceId());
  revalidatePath("/app/tasks");
}
