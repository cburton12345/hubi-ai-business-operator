"use server";

import { revalidatePath } from "next/cache";
import { queueWeeklyAiTasks } from "@/lib/ai/queue-weekly-tasks";

export async function queueWeeklyAiTasksAction() {
  await queueWeeklyAiTasks();
  revalidatePath("/app/tasks");
}
