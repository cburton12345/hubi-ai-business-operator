import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("durable email document intake", () => {
  it("queues one durable job per attachment and deduplicates provider retries", () => {
    const migration = source("supabase/migrations/250_document_email_ingestion_jobs.sql");
    const jobs = source("src/lib/document-intelligence/email-intake-jobs.ts");
    expect(migration).toContain("unique (tenant_id,provider_message_id,provider_attachment_id)");
    expect(migration).toContain("unique (batch_id,file_index)");
    expect(jobs).toContain("on conflict (tenant_id,provider_message_id,provider_attachment_id)");
    expect(jobs).toContain("provider_message_id=$2");
    expect(jobs).toContain("recordMissingDocumentImportBatchFailures");
    expect(jobs).toContain("rejectedAttachmentCount");
  });

  it("records unsupported, oversized, and duplicate attachments as explicit failed batch items", () => {
    const route = source("src/app/api/integrations/resend/inbound/route.ts");
    expect(route).toContain("Unsupported attachment type:");
    expect(route).toContain("larger than 15 MB");
    expect(route).toContain("repeated this attachment identifier");
    expect(route).toContain("rejectedAttachments: attachmentInventory.rejected");
    expect(route).toContain("rejected: attachmentInventory.rejected.length");
  });

  it("acknowledges the webhook after queueing instead of running OCR inline", () => {
    const route = source("src/app/api/integrations/resend/inbound/route.ts");
    expect(route).toContain("enqueueResendExpenseEmail");
    expect(route).toContain("dispatchExpenseEmailJobs");
    expect(route).toContain("return json(202");
    expect(route).not.toContain("processExpenseDocumentBatch({");
  });

  it("resolves provider IDs, accepts Resend's CDN, and retries stale jobs", () => {
    const route = source("src/app/api/integrations/resend/inbound/route.ts");
    const jobs = source("src/lib/document-intelligence/email-intake-jobs.ts");
    const recovery = source("netlify/functions/run-document-email-recovery.ts");
    expect(route).toContain("resolveReceivedEmailId");
    expect(jobs).toContain('url.hostname.endsWith(".resend.app")');
    expect(jobs).toContain("attempts<$2");
    expect(jobs).toContain("locked_at<now()-interval '12 minutes'");
    expect(recovery).toContain('schedule: "3,18,33,48 * * * *"');
  });

  it("processes each queued attachment in an independent background invocation", () => {
    const background = source("netlify/functions/process-document-email-background.ts");
    const jobs = source("src/lib/document-intelligence/email-intake-jobs.ts");
    expect(background).toContain("processResendExpenseEmailJob");
    expect(background).toContain("background: true");
    expect(jobs).toContain("files: [file]");
    expect(jobs).toContain("recordDocumentImportBatchItem");
  });

  it("supports canceling unresolved work without deleting preserved completed evidence", () => {
    const migration = source("supabase/migrations/263_document_batch_cancellation.sql");
    const batches = source("src/lib/document-intelligence/document-batches.ts");
    const jobs = source("src/lib/document-intelligence/email-intake-jobs.ts");
    expect(migration).toContain("'canceled'");
    expect(batches).toContain("cancelDocumentImportBatch");
    expect(batches).toContain("status='canceled'");
    expect(jobs).toContain("stillActive");
    expect(jobs).toContain("status<>'canceled'");
  });
});
