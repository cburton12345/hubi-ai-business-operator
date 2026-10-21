export const MAX_EXPENSE_DOCUMENT_FILES = 25;
export const MAX_EXPENSE_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_EXPENSE_BATCH_BYTES = MAX_EXPENSE_DOCUMENT_FILES * MAX_EXPENSE_DOCUMENT_BYTES;

export type UploadLike = Pick<File, "name" | "size">;

export function validateExpenseDocumentSelection(files: UploadLike[]) {
  if (!files.length) return "Choose at least one document to import.";
  if (files.length > MAX_EXPENSE_DOCUMENT_FILES) {
    return `Choose up to ${MAX_EXPENSE_DOCUMENT_FILES} files in one batch.`;
  }
  const oversized = files.find((file) => file.size > MAX_EXPENSE_DOCUMENT_BYTES);
  if (oversized) return `${oversized.name || "A document"} is larger than 15 MB.`;
  const totalBytes = files.reduce((sum, file) => sum + Math.max(0, file.size), 0);
  if (totalBytes > MAX_EXPENSE_BATCH_BYTES) {
    return "This batch is larger than the supported 375 MB total. Split it into smaller batches.";
  }
  return null;
}
