import "server-only";

import {
  cancelDocumentImportBatch,
  createDocumentImportBatch,
  listDocumentImportBatchItemOutcomes,
  recordDocumentImportBatchItem,
  recordMissingDocumentImportBatchFailures,
  refreshDocumentImportBatch,
  requireDocumentImportBatchProcessing,
} from "@/lib/document-intelligence/document-batches";
import type {
  DirectUploadCreateBatchInput,
  DirectUploadFinalizeInput,
  DirectUploadProcessInput,
} from "@/lib/document-intelligence/direct-upload-protocol";
import { getStatementCoverageForDocument } from "@/lib/document-intelligence/statement-year-coverage";
import { processPreparedExpenseDocumentBatch } from "@/lib/document-intelligence/workflow";
import { prepareReceiptUpload } from "@/lib/operations-workforce/receipt-upload";

export type DirectUploadActor = { workspaceId: string; userId: string | null };

export async function createExpenseDocumentImportBatch(
  actor: DirectUploadActor,
  input: DirectUploadCreateBatchInput,
) {
  return createDocumentImportBatch({
    tenantId: actor.workspaceId,
    userId: actor.userId,
    ...input,
    sourceChannel: "upload",
  });
}

export async function prepareExpenseDocumentUpload(
  actor: DirectUploadActor,
  input: { name: string; type: string; size: number },
) {
  return prepareReceiptUpload(actor.workspaceId, input);
}

export async function processPreparedExpenseDocument(
  actor: DirectUploadActor,
  input: DirectUploadProcessInput,
) {
  await requireDocumentImportBatchProcessing(actor.workspaceId, input.batchId);
  const result = await processPreparedExpenseDocumentBatch({
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    uploads: [input.reference],
    sourceChannel: "upload",
    sourceProduct: input.sourceProduct === "ferocity" ? "ferocity" : undefined,
    sourceMessageRef: input.sourceMessageRef,
    suppliedText: input.suppliedText,
  });
  await requireDocumentImportBatchProcessing(actor.workspaceId, input.batchId);
  const completed = result.completed[0];
  if (completed) {
    await recordDocumentImportBatchItem({
      tenantId: actor.workspaceId,
      batchId: input.batchId,
      fileIndex: input.fileIndex,
      fileName: completed.fileName,
      mimeType: input.reference.mimeType,
      byteCount: input.reference.byteCount,
      documentId: completed.result.documentId,
      outcome: completed.result.reusedExisting ? "reused" : "imported",
    });
    const statementCoverage = await getStatementCoverageForDocument(
      actor.workspaceId,
      completed.result.documentId,
    );
    return {
      ok: true as const,
      fileName: completed.fileName,
      status: completed.result.reusedExisting ? "already imported" : completed.result.status,
      documentId: completed.result.documentId,
      reusedExisting: completed.result.reusedExisting,
      statementCoverage,
    };
  }

  const failure = result.failed[0]?.error ?? "Document processing failed.";
  const fileName = result.failed[0]?.fileName ?? input.reference.fileName;
  await recordDocumentImportBatchItem({
    tenantId: actor.workspaceId,
    batchId: input.batchId,
    fileIndex: input.fileIndex,
    fileName,
    mimeType: input.reference.mimeType,
    byteCount: input.reference.byteCount,
    outcome: "failed",
    errorMessage: failure,
  });
  return { ok: false as const, fileName, error: failure };
}

export async function cancelExpenseDocumentImportBatch(
  actor: DirectUploadActor,
  input: { batchId: string },
) {
  return cancelDocumentImportBatch({ tenantId: actor.workspaceId, batchId: input.batchId });
}

export async function finalizeExpenseDocumentImportBatch(
  actor: DirectUploadActor,
  input: DirectUploadFinalizeInput,
) {
  if (input.unresolvedFailures.length) {
    await recordMissingDocumentImportBatchFailures({
      tenantId: actor.workspaceId,
      batchId: input.batchId,
      failures: input.unresolvedFailures,
    });
  }
  const summary = await refreshDocumentImportBatch(actor.workspaceId, input.batchId);
  const items = await listDocumentImportBatchItemOutcomes(actor.workspaceId, input.batchId);
  return { summary, items };
}
