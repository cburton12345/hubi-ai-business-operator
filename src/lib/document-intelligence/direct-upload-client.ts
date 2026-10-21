"use client";

import type {
  DocumentImportBatchItemOutcome,
  DocumentImportBatchSummary,
} from "@/lib/document-intelligence/document-batches";
import type { DirectUploadFailedItem } from "@/lib/document-intelligence/direct-upload-protocol";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { StatementYearCoverage } from "./statement-year-coverage";

const uploadControlEndpoint = "/api/document-intelligence/import/upload";

type PreparedUpload = {
  storagePath: string;
  storageEventId: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  token: string;
};

type ControlResponse = { ok: boolean; error?: string };

export class DirectUploadCanceledError extends Error {
  constructor() {
    super("The document import was canceled. Completed documents remain preserved.");
    this.name = "DirectUploadCanceledError";
  }
}

export type DirectDocumentResult =
  | { ok: true; fileName: string; status: string; documentId: string; reusedExisting: boolean; statementCoverage?: StatementYearCoverage | null }
  | { ok: false; fileName: string; error: string };

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

async function postUploadControl<T extends ControlResponse>(body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(uploadControlEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch {
    if (signal?.aborted) throw new DirectUploadCanceledError();
    throw new Error("Ferocity could not reach the secure upload service. Check the connection and retry the selected files.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      response.redirected || response.status === 401 || response.status === 403
        ? "Your Ferocity session may have expired. Refresh, sign in if asked, and retry the selected files."
        : "Ferocity received an invalid upload-service response. Refresh and retry the selected files.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || typeof (payload as { ok?: unknown }).ok !== "boolean") {
    throw new Error("Ferocity could not verify the upload-service response. Refresh and retry the selected files.");
  }
  return payload as T;
}

function throwIfCanceled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DirectUploadCanceledError();
}

export async function cancelExpenseDocumentUploadBatch(batchId: string) {
  const response = await postUploadControl<ControlResponse & { batch?: { id: string; status: "canceled" } }>({
    operation: "cancel_batch",
    input: { batchId },
  });
  if (!response.ok || response.batch?.status !== "canceled") {
    throw new Error(response.error ?? "Ferocity could not cancel the document import.");
  }
  return response.batch;
}

function failedItem(file: File, fileIndex: number, error: string): DirectUploadFailedItem {
  return {
    fileIndex,
    fileName: file.name,
    mimeType: file.type || null,
    byteCount: file.size,
    error: error.slice(0, 1000),
  };
}

export async function uploadAndProcessExpenseDocuments(input: {
  files: File[];
  sourceProduct: "ferocity" | "expense_intelligence";
  sourceMessageRef?: string | null;
  suppliedText?: string | null;
  batchLabel?: string | null;
  projectId?: string | null;
  newProjectName?: string | null;
  taxYear?: number | null;
  onProgress?: (message: string) => void;
  onBatchCreated?: (batchId: string) => void | Promise<void>;
  signal?: AbortSignal;
}) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Secure browser upload is not configured.");
  const createdBatch = await postUploadControl<ControlResponse & { id?: string; projectId: string | null }>({
    operation: "create_batch",
    input: {
      expectedFileCount: input.files.length,
      label: input.batchLabel ?? null,
      projectId: input.projectId ?? null,
      newProjectName: input.newProjectName ?? null,
      taxYear: input.taxYear ?? null,
    },
  }, input.signal);
  if (!createdBatch.ok || !createdBatch.id) {
    throw new Error(createdBatch.error ?? "Ferocity could not create the upload batch.");
  }
  await input.onBatchCreated?.(createdBatch.id);
  throwIfCanceled(input.signal);

  const results: DirectDocumentResult[] = [];
  const unresolvedFailures: DirectUploadFailedItem[] = [];
  for (const [index, file] of input.files.entries()) {
    try {
      throwIfCanceled(input.signal);
      input.onProgress?.(`Uploading ${index + 1} of ${input.files.length}: ${file.name}`);
      const ticket = await postUploadControl<ControlResponse & { prepared?: PreparedUpload }>({
        operation: "prepare_file",
        input: { name: file.name, type: file.type, size: file.size },
      }, input.signal);
      if (!ticket.ok || !ticket.prepared) {
        throw new Error(ticket.error ?? "Secure upload preparation failed.");
      }

      const uploaded = await supabase.storage
        .from("receipt-expense-assets")
        .uploadToSignedUrl(ticket.prepared.storagePath, ticket.prepared.token, file, {
          contentType: ticket.prepared.mimeType,
        });
      if (uploaded.error) {
        throw new Error("The direct upload failed. Check the connection and retry this file.");
      }
      throwIfCanceled(input.signal);

      input.onProgress?.(`Analyzing ${index + 1} of ${input.files.length}: ${file.name}`);
      const { token: _token, ...reference } = ticket.prepared;
      const processed = await postUploadControl<ControlResponse & Partial<DirectDocumentResult>>({
        operation: "process_file",
        input: {
          reference,
          sourceProduct: input.sourceProduct,
          sourceMessageRef: input.sourceMessageRef ?? null,
          suppliedText: input.suppliedText ?? null,
          batchId: createdBatch.id,
          fileIndex: index,
        },
      }, input.signal);
      if (!processed.ok) {
        results.push({ ok: false, fileName: file.name, error: processed.error ?? "Document processing failed." });
      } else if (processed.fileName && processed.status && processed.documentId && typeof processed.reusedExisting === "boolean") {
        results.push({
          ok: true,
          fileName: processed.fileName,
          status: processed.status,
          documentId: processed.documentId,
          reusedExisting: processed.reusedExisting,
          statementCoverage: processed.statementCoverage,
        });
      } else {
        throw new Error("Ferocity could not verify the document-processing result.");
      }
    } catch (error) {
      if (error instanceof DirectUploadCanceledError || input.signal?.aborted) {
        throw new DirectUploadCanceledError();
      }
      const message = errorMessage(error, "The document could not be imported.");
      results.push({ ok: false, fileName: file.name, error: message });
      unresolvedFailures.push(failedItem(file, index, message));
    }
  }

  throwIfCanceled(input.signal);
  input.onProgress?.("Finalizing the document batch…");
  const finalizeBody = {
    operation: "finalize_batch",
    input: { batchId: createdBatch.id, unresolvedFailures },
  };
  let finalized: ControlResponse & {
    summary?: DocumentImportBatchSummary;
    items?: DocumentImportBatchItemOutcome[];
  };
  try {
    finalized = await postUploadControl(finalizeBody, input.signal);
  } catch {
    throwIfCanceled(input.signal);
    finalized = await postUploadControl(finalizeBody, input.signal);
  }
  if (!finalized.ok || !finalized.summary) {
    throw new Error(finalized.error ?? "The upload batch could not be finalized. Your selected files remain available to retry.");
  }
  for (const item of finalized.items ?? []) {
    const current = results[item.fileIndex];
    if (current?.ok || item.outcome === "failed" || !item.documentId) continue;
    results[item.fileIndex] = {
      ok: true,
      fileName: item.fileName,
      status: item.outcome === "reused" ? "already imported" : "imported",
      documentId: item.documentId,
      reusedExisting: item.outcome === "reused",
    };
  }
  return { results, batch: finalized.summary, projectId: createdBatch.projectId };
}
