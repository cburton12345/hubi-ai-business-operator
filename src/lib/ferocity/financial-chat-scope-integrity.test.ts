import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { evidenceDomainsForFerocityCommand } from "./scoped-business-evidence";

vi.mock("server-only", () => ({}));

describe("financial Ask Ferocity scope integrity", () => {
  it("keeps a financial-document question inside financial evidence", () => {
    expect(evidenceDomainsForFerocityCommand(
      "Read-only certification: how many financial documents need review, and where do I review them? Do not create or change anything.",
      [],
    )).toEqual(["money_documents"]);
  });

  it("discards unrelated model capabilities before collecting financial evidence", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/app/ai-workforce/actions.ts"),
      "utf8",
    );
    expect(source).toContain("preliminaryFinancialDocumentScope ? [] : initialUnderstanding.capabilities");
  });
});
