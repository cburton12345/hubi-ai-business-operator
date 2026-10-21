"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  consumeInventoryReservation,
  recordInventoryCount,
  releaseInventoryReservation,
  reserveInventory,
  transferInventory
} from "@/lib/service-ops/inventory-control";
import { allocateConsumedMaterial, cancelMaterialAllocation } from "@/lib/service-ops/inventory-cost-control";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const key = z.string().uuid();
const quantity = z.coerce.number().positive().max(999999);

function requireApplied(status: string) {
  if (status === "applied" || status === "existing") return;
  if (status === "insufficient") throw new Error("There is not enough unreserved stock for that operation.");
  throw new Error("The inventory operation could not be applied to the selected records.");
}

export async function transferInventoryAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({ itemId: z.string().uuid(), fromLocationId: z.string().uuid(), toLocationId: z.string().uuid(), quantity, reason: z.string().trim().min(2).max(500), idempotencyKey: key }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await transferInventory({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
}

export async function reserveInventoryAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({ itemId: z.string().uuid(), locationId: z.string().uuid(), workOrderId: z.string().uuid(), quantity, idempotencyKey: key }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await reserveInventory({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
}

export async function consumeInventoryReservationAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({ reservationId: z.string().uuid(), quantity, idempotencyKey: key }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await consumeInventoryReservation({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
}

export async function releaseInventoryReservationAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({ reservationId: z.string().uuid(), idempotencyKey: key }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await releaseInventoryReservation({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
}

export async function recordInventoryCountAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({ itemId: z.string().uuid(), locationId: z.string().uuid(), observedQuantity: z.coerce.number().min(0).max(999999), reason: z.string().trim().min(2).max(500), idempotencyKey: key }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await recordInventoryCount({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
}

export async function allocateConsumedMaterialAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({
    sourceTransactionId: z.string().uuid(),
    serviceJobId: z.union([z.string().uuid(), z.literal("")]).optional(),
    customerLocationId: z.union([z.string().uuid(), z.literal("")]).optional(),
    quantity,
    note: z.string().trim().max(500).optional(),
    idempotencyKey: key
  }).superRefine((value, context) => {
    if (!value.serviceJobId && !value.customerLocationId) context.addIssue({ code: "custom", message: "Select a job or property." });
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await allocateConsumedMaterial({
    tenantId: await getCurrentWorkspaceId(),
    sourceTransactionId: parsed.data.sourceTransactionId,
    serviceJobId: parsed.data.serviceJobId || null,
    customerLocationId: parsed.data.customerLocationId || null,
    quantity: parsed.data.quantity,
    note: parsed.data.note || null,
    idempotencyKey: parsed.data.idempotencyKey
  });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
  revalidatePath("/app/job-tracker");
}

export async function cancelMaterialAllocationAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = z.object({ allocationId: z.string().uuid(), idempotencyKey: key }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const result = await cancelMaterialAllocation({ tenantId: await getCurrentWorkspaceId(), ...parsed.data });
  requireApplied(result.status);
  revalidatePath("/app/service/inventory");
  revalidatePath("/app/job-tracker");
}
