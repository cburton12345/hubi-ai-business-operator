"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  directUploadCreateBatchSchema,
  directUploadFailedItemSchema,
  directUploadMetadataSchema,
  directUploadProcessSchema,
} from "@/lib/document-intelligence/direct-upload-protocol";
import {
  createExpenseDocumentImportBatch,
  finalizeExpenseDocumentImportBatch,
  prepareExpenseDocumentUpload,
  processPreparedExpenseDocument,
} from "@/lib/document-intelligence/direct-upload-service";
import {
  assignDocumentImportBatchProject,
  cancelDocumentImportBatch,
  recordDocumentImportBatchItem,
} from "@/lib/document-intelligence/document-batches";
const failedBatchItemSchema = directUploadFailedItemSchema.extend({
  batchId: z.string().uuid(),
});

function uploadActor(actor: Awaited<ReturnType<typeof requirePermission>>) {
  return {
    workspaceId: actor.workspace.id,
    userId: actor.userId === "admin-token" ? null : actor.userId,
  };
}

export async function createExpenseDocumentImportBatchAction(input: unknown) {
  const actor = await requirePermission("lead:manage");
  const parsed = directUploadCreateBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "The upload batch details are invalid." };
  try {
    const batch = await createExpenseDocumentImportBatch(uploadActor(actor), parsed.data);
    return { ok: true as const, ...batch };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The upload batch could not be created." };
  }
}

export async function prepareExpenseDocumentUploadAction(input: unknown) {
  const actor = await requirePermission("lead:manage");
  const parsed = directUploadMetadataSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "The selected file is invalid or larger than 15 MB." };
  try {
    const prepared = await prepareExpenseDocumentUpload(uploadActor(actor), parsed.data);
    return { ok: true as const, prepared };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Secure upload preparation failed." };
  }
}

export async function processPreparedExpenseDocumentAction(input: unknown) {
  const actor = await requirePermission("lead:manage");
  const parsed = directUploadProcessSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, fileName: "Document", error: "The prepared upload reference is invalid." };
  const result = await processPreparedExpenseDocument(uploadActor(actor), parsed.data);
  revalidatePath("/app/expenses");
  revalidatePath("/app/job-tracker");
  return result;
}

export async function recordExpenseDocumentImportFailureAction(input: unknown) {
  const actor = await requirePermission("lead:manage");
  const parsed = failedBatchItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "The failed upload details are invalid." };
  try {
    await recordDocumentImportBatchItem({
      tenantId: actor.workspace.id,
      batchId: parsed.data.batchId,
      fileIndex: parsed.data.fileIndex,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      byteCount: parsed.data.byteCount,
      outcome: "failed",
      errorMessage: parsed.data.error,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The failed upload could not be recorded." };
  }
}

export async function finalizeExpenseDocumentImportBatchAction(batchId: string) {
  const actor = await requirePermission("lead:manage");
  const parsed = z.string().uuid().safeParse(batchId);
  if (!parsed.success) return { ok: false as const, error: "The upload batch is invalid." };
  try {
    const finalized = await finalizeExpenseDocumentImportBatch(uploadActor(actor), {
      batchId: parsed.data,
      unresolvedFailures: [],
    });
    revalidatePath("/app/expenses");
    return { ok: true as const, summary: finalized.summary };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The upload batch could not be finalized." };
  }
}

export async function assignExpenseDocumentBatchProjectAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const parsed = z.object({
    batchId: z.string().uuid(),
    projectId: z.union([z.string().uuid(), z.literal("")]),
  }).safeParse({ batchId: formData.get("batchId"), projectId: formData.get("projectId") });
  if (!parsed.success) return;
  await assignDocumentImportBatchProject({
    tenantId: actor.workspace.id,
    batchId: parsed.data.batchId,
    projectId: parsed.data.projectId || null,
  });
  revalidatePath("/app/expenses");
}

export async function cancelExpenseDocumentBatchAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const batchId = z.string().uuid().safeParse(formData.get("batchId"));
  if (!batchId.success) return;
  await cancelDocumentImportBatch({ tenantId: actor.workspace.id, batchId: batchId.data });
  revalidatePath("/app/expenses");
}
