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
import { queryPostgres } from "@/lib/db/postgres";
import {
  destinationKey,
  normalizeReviewUrl,
  reviewDestinationProviders
} from "@/lib/reviews/review-destinations";

const queueItemSchema = z.object({
  itemId: z.string().uuid(),
  notes: z.string().max(1000).optional()
});

const destinationSchema = z.object({
  brandId: z.union([z.string().uuid(), z.literal("")]).optional(),
  provider: z.enum(reviewDestinationProviders),
  displayName: z.string().trim().min(2).max(100),
  reviewUrl: z.string().trim().max(2000),
  priority: z.coerce.number().int().min(1).max(999).default(100)
});

const destinationIdSchema = z.string().uuid();

export async function saveReviewDestinationAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = destinationSchema.safeParse({
    brandId: formData.get("brandId")?.toString() ?? "",
    provider: formData.get("provider"),
    displayName: formData.get("displayName"),
    reviewUrl: formData.get("reviewUrl"),
    priority: formData.get("priority") || 100
  });
  if (!parsed.success) return;

  const reviewUrl = normalizeReviewUrl(parsed.data.reviewUrl);
  if (!reviewUrl) return;
  const brandId = parsed.data.brandId || null;
  if (brandId) {
    const brand = await queryPostgres<{ id: string }>(
      "select id from public.brands where tenant_id = $1 and id = $2 and status = 'active' limit 1",
      [workspaceId, brandId]
    );
    if (!brand?.rows[0]) return;
  }

  const key = destinationKey(parsed.data.provider, parsed.data.displayName);
  await queryPostgres(
    `
    insert into public.review_request_destinations (
      tenant_id, brand_id, destination_key, provider, display_name, review_url,
      priority, status, verified_at, metadata_json
    ) values ($1, $2, $3, $4, $5, $6, $7, 'active', now(), '{"source":"manual_configuration"}'::jsonb)
    on conflict (tenant_id, brand_id, destination_key) do update
    set provider = excluded.provider,
        display_name = excluded.display_name,
        review_url = excluded.review_url,
        priority = excluded.priority,
        status = 'active',
        verified_at = now(),
        updated_at = now()
    `,
    [workspaceId, brandId, key, parsed.data.provider, parsed.data.displayName, reviewUrl, parsed.data.priority]
  );
  revalidatePath("/app/review");
}

export async function archiveReviewDestinationAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = destinationIdSchema.safeParse(formData.get("destinationId"));
  if (!parsed.success) return;
  await queryPostgres(
    "update public.review_request_destinations set status = 'archived', updated_at = now() where tenant_id = $1 and id = $2",
    [workspaceId, parsed.data]
  );
  revalidatePath("/app/review");
}

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
