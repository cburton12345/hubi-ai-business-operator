"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  approveReviewFirstExportQueueItem,
  executeReviewFirstExportQueueItem
} from "@/lib/marketing-os/review-first-export-queue";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const queueItemSchema = z.object({
  itemId: z.string().uuid(),
  notes: z.string().max(1000).optional()
});

export async function approveExportQueueItemAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = queueItemSchema.safeParse({
    itemId: formData.get("itemId"),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  await approveReviewFirstExportQueueItem(workspaceId, parsed.data.itemId, session?.userId ?? null, parsed.data.notes);
  revalidatePath("/app/review");
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/operator");
}

export async function runExportQueueItemAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = queueItemSchema.safeParse({
    itemId: formData.get("itemId"),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  await executeReviewFirstExportQueueItem(workspaceId, parsed.data.itemId, session?.userId ?? null);
  revalidatePath("/app/review");
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/operator");
}
