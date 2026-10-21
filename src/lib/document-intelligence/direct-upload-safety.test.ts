import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("direct private document upload", () => {
  it("keeps document bytes out of the Netlify function request", () => {
    const client = source("src/lib/document-intelligence/direct-upload-client.ts");
    expect(client).toContain("createBrowserSupabaseClient");
    expect(client).toContain("uploadToSignedUrl");
    expect(client).toContain('/api/document-intelligence/import/upload');
    expect(client).not.toContain("upload-actions");
  });

  it("binds prepared uploads to the authenticated workspace and reserved storage event", () => {
    const upload = source("src/lib/operations-workforce/receipt-upload.ts");
    expect(upload).toContain("tenant_id = $2 and bucket = $3 and storage_key = $4");
    expect(upload).toContain('reference.storagePath.startsWith(`${tenantId}/`)');
    expect(upload).toContain("directUploadVerified");
  });

  it("processes each file independently and preserves filename-keyed outcomes", () => {
    const actions = source("src/app/app/expenses/upload-actions.ts");
    const service = source("src/lib/document-intelligence/direct-upload-service.ts");
    const chat = source("src/app/app/ferocity/FerocityOwnerChat.tsx");
    const importer = source("src/app/app/expenses/DocumentDropzone.tsx");
    expect(actions).toContain("processPreparedExpenseDocument");
    expect(service).toContain("uploads: [input.reference]");
    expect(chat).toContain('payload.set("processedDocuments", JSON.stringify(processed.results))');
    expect(importer).toContain("failedFiles.forEach");
  });

  it("finalizes client-side interruptions as failed items without overwriting completed files", () => {
    const client = source("src/lib/document-intelligence/direct-upload-client.ts");
    const batches = source("src/lib/document-intelligence/document-batches.ts");
    expect(client).toContain("unresolvedFailures.push");
    expect(client).toContain('operation: "finalize_batch"');
    expect(batches).toContain("on conflict (batch_id,file_index) do nothing");
  });

  it("lets an operator cancel a direct upload and rechecks cancellation before recording results", () => {
    const client = source("src/lib/document-intelligence/direct-upload-client.ts");
    const service = source("src/lib/document-intelligence/direct-upload-service.ts");
    const dropzone = source("src/app/app/expenses/DocumentDropzone.tsx");
    expect(client).toContain('operation: "cancel_batch"');
    expect(client).toContain("DirectUploadCanceledError");
    expect(service.match(/requireDocumentImportBatchProcessing/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dropzone).toContain("Cancel import");
    expect(dropzone).toContain("cancelExpenseDocumentUploadBatch");
  });

  it("tells Ask Ferocity that successful direct uploads are already available", () => {
    const actions = source("src/app/app/ferocity/actions.ts");
    expect(actions).toContain("Document ingestion status (authoritative)");
    expect(actions).toContain("Do not ask the owner to upload a successfully imported file again");
    expect(actions).toContain("ownerFacingCommand");
    expect(actions).toContain('intent: "document_intake"');
    expect(actions).toContain("documentResult ?? financialReportResult ?? await executeAiWorkforceCommandAction");
    expect(actions).toContain("continuesDocumentIntelligenceConversation");
    expect(actions).toContain('href: "/app/expenses"');
    expect(actions).toContain("already here, so I did not add");
    expect(actions).toContain("a quick check");
    expect(actions).toContain("prepared: result.prepared ?? []");
  });
});
