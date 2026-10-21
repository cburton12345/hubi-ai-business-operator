import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("document workflow integrity", () => {
  it("keeps upload batches separate and combines them only through an explicit project assignment", () => {
    const batches = source("src/lib/document-intelligence/document-batches.ts");
    const page = source("src/app/app/expenses/page.tsx");
    expect(batches).toContain("insert into public.document_intelligence_import_batches");
    expect(batches).toContain("assignDocumentImportBatchProject");
    expect(batches).toContain("where tenant_id=$1 and id=$2 returning id");
    expect(page).toContain("Every new selection has its own batch");
    expect(page).toContain("Keep separate");
    expect(page).toContain("Save project");
  });

  it("never preconfirms a merchant-location property suggestion", () => {
    const page = source("src/app/app/expenses/page.tsx");
    const classifier = source("src/lib/document-intelligence/statement-classification.ts");
    const readiness = source("src/lib/document-intelligence/financial-workpaper-readiness.ts");
    expect(page).toContain('const selectedAllocation = "unassigned|"');
    expect(classifier).toContain('assignmentEvidence: "merchant_location_suggestion"');
    expect(readiness).toContain("merchant_location_suggestion");
  });

  it("preserves lease authority in H4R and requires owner review before any field or signature action", () => {
    const route = source("src/app/api/integrations/h4r/lease-documents/analyze/route.ts");
    expect(route).toContain("source_product='homes4rent'");
    expect(route).toContain("content_sha256");
    expect(route).toContain("human_review_required");
    expect(route).toContain('mode: "review_only"');
    expect(route).toContain("No field was accepted and no lease was sent or signed.");
  });

  it("gives every email attachment a durable imported, reused, or failed outcome", () => {
    const route = source("src/app/api/integrations/resend/inbound/route.ts");
    const jobs = source("src/lib/document-intelligence/email-intake-jobs.ts");
    expect(route).toContain("attachmentInventory.rejected");
    expect(route).toContain("Document email arrived without attachments");
    expect(jobs).toContain("recordMissingDocumentImportBatchFailures");
    expect(jobs).toContain("supportedAttachmentCount");
    expect(jobs).toContain("rejectedAttachmentCount");
  });
});
