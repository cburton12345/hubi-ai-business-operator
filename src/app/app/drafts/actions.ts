"use server";

import { revalidatePath } from "next/cache";
import { processQueuedAiTasks } from "@/lib/ai/process-queued-tasks";

export async function processQueuedAiTasksAction() {
  await processQueuedAiTasks();
  revalidatePath("/app/tasks");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
  revalidatePath("/app/approvals");
}
