"use server";

import { revalidatePath } from "next/cache";
import { processQueuedAiTasks } from "@/lib/ai/process-queued-tasks";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function processQueuedAiTasksAction() {
  await processQueuedAiTasks(await getCurrentWorkspaceId());
  revalidatePath("/app/tasks");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
  revalidatePath("/app/approvals");
}
