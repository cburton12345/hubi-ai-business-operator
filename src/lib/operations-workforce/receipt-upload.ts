import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishStorageUpload, reserveStorageUpload } from "@/lib/usage/storage-quota";
import { MAX_EXPENSE_DOCUMENT_BYTES } from "@/lib/document-intelligence/upload-policy";
import { queryPostgres } from "@/lib/db/postgres";

export const receiptBucket = "receipt-expense-assets";
export const maxReceiptUploadBytes = MAX_EXPENSE_DOCUMENT_BYTES;
const structuredDocumentExtensions = new Set(["csv", "tsv", "txt", "xml", "ofx", "qfx", "qbo", "xlsx"]);
const structuredDocumentMimeTypes: Record<string, string> = {
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  xml: "application/xml",
  ofx: "application/x-ofx",
  qfx: "application/vnd.intu.qfx",
  qbo: "application/vnd.intu.qbo",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

export type ReceiptUploadResult = {
  storageUri: string | null;
  signedUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadStatus: "none" | "unsupported_type" | "too_large" | "quota_exceeded" | "storage_not_configured" | "upload_failed" | "uploaded";
  uploadError?: string;
};

export type PreparedReceiptUpload = {
  storagePath: string;
  storageEventId: string;
  token: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
};

export type PreparedReceiptUploadReference = Omit<PreparedReceiptUpload, "token">;

export function safeFileName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "receipt";
}

export function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value &&
      typeof value.name === "string" &&
      typeof value.size === "number" &&
      value.size > 0
  );
}

export function receiptUploadMimeType(file: Pick<File, "name" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (structuredDocumentMimeTypes[extension] ?? file.type) || "application/octet-stream";
}

export async function uploadReceiptPhoto(tenantId: string, file: File | null): Promise<ReceiptUploadResult> {
  if (!file) {
    return { storageUri: null, signedUrl: null, fileName: null, mimeType: null, uploadStatus: "none" };
  }

  const mimeType = receiptUploadMimeType(file);
  const detectedExtension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!mimeType.startsWith("image/") && mimeType !== "application/pdf" && !structuredDocumentExtensions.has(detectedExtension)) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "unsupported_type" };
  }

  if (file.size > maxReceiptUploadBytes) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "too_large" };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "storage_not_configured" };
  }

  const extension = safeFileName(file.name).split(".").pop();
  const storagePath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const storageEventId = await reserveStorageUpload({
    tenantId,
    bucket: receiptBucket,
    storageKey: storagePath,
    sourceType: "expense_receipt",
    byteCount: file.size,
    idempotencyKey: `receipt:${storagePath}`,
    metadata: { fileName: file.name, mimeType }
  });
  if (!storageEventId) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "quota_exceeded" };
  }

  const upload = await supabase.storage.from(receiptBucket).upload(storagePath, await file.arrayBuffer(), {
    contentType: mimeType,
    upsert: false
  });

  if (upload.error) {
    await finishStorageUpload(storageEventId, "failed", { providerError: upload.error.message });
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "upload_failed", uploadError: upload.error.message };
  }
  await finishStorageUpload(storageEventId, "active");

  const signed = mimeType.startsWith("image/")
    ? await supabase.storage.from(receiptBucket).createSignedUrl(storagePath, 60 * 15)
    : null;

  return {
    storageUri: `supabase://${receiptBucket}/${storagePath}`,
    signedUrl: signed?.data?.signedUrl ?? null,
    fileName: file.name,
    mimeType,
    uploadStatus: "uploaded"
  };
}

export async function prepareReceiptUpload(tenantId: string, input: { name: string; type: string; size: number }): Promise<PreparedReceiptUpload> {
  const mimeType = receiptUploadMimeType(input);
  const extension = input.name.split(".").pop()?.toLowerCase() ?? "";
  if (!mimeType.startsWith("image/") && mimeType !== "application/pdf" && !structuredDocumentExtensions.has(extension)) {
    throw new Error(`${input.name || "Document"} is not a supported document type.`);
  }
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > maxReceiptUploadBytes) {
    throw new Error(`${input.name || "Document"} must be between 1 byte and 15 MB.`);
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Private document storage is not configured.");
  const safeName = safeFileName(input.name);
  const storagePath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
  const storageEventId = await reserveStorageUpload({
    tenantId,
    bucket: receiptBucket,
    storageKey: storagePath,
    sourceType: "expense_receipt",
    byteCount: input.size,
    idempotencyKey: `receipt:${storagePath}`,
    metadata: { fileName: input.name, mimeType, directUpload: true }
  });
  if (!storageEventId) throw new Error("Workspace storage quota is exhausted.");
  const signed = await supabase.storage.from(receiptBucket).createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data?.token) {
    await finishStorageUpload(storageEventId, "failed", { providerError: signed.error?.message ?? "Signed upload unavailable" });
    throw new Error("A secure upload URL could not be prepared.");
  }
  return { storagePath, storageEventId, token: signed.data.token, fileName: input.name, mimeType, byteCount: input.size };
}

export async function consumePreparedReceiptUpload(tenantId: string, reference: PreparedReceiptUploadReference) {
  const reservation = await queryPostgres<{ allowed: boolean }>(`
    select exists(
      select 1 from public.storage_usage_events
      where id = $1 and tenant_id = $2 and bucket = $3 and storage_key = $4
        and byte_count = $5 and status in ('reserved','active')
    ) as allowed`, [reference.storageEventId, tenantId, receiptBucket, reference.storagePath, reference.byteCount]);
  if (reservation?.rows[0]?.allowed !== true || !reference.storagePath.startsWith(`${tenantId}/`)) {
    throw new Error("The prepared upload is invalid or belongs to another workspace.");
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Private document storage is not configured.");
  const info = await supabase.storage.from(receiptBucket).info(reference.storagePath);
  if (info.error || Number(info.data?.size ?? -1) !== reference.byteCount) {
    await finishStorageUpload(reference.storageEventId, "failed", { providerError: info.error?.message ?? "Uploaded byte count did not match reservation" });
    throw new Error("The uploaded file is missing or incomplete.");
  }
  const downloaded = await supabase.storage.from(receiptBucket).download(reference.storagePath);
  if (downloaded.error || !downloaded.data) throw new Error("The uploaded file could not be opened for processing.");
  await finishStorageUpload(reference.storageEventId, "active", { directUploadVerified: true });
  const signed = reference.mimeType.startsWith("image/")
    ? await supabase.storage.from(receiptBucket).createSignedUrl(reference.storagePath, 60 * 15)
    : null;
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const file = new File([bytes], reference.fileName, { type: reference.mimeType });
  return {
    file,
    bytes,
    upload: {
      storageUri: `supabase://${receiptBucket}/${reference.storagePath}`,
      signedUrl: signed?.data?.signedUrl ?? null,
      fileName: reference.fileName,
      mimeType: reference.mimeType,
      uploadStatus: "uploaded" as const
    }
  };
}
