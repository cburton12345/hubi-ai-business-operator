import { beforeEach, describe, expect, it, vi } from "vitest";

const queryPostgresRequired = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/postgres", () => ({ queryPostgresRequired }));

import { getStatementFinancialPacket } from "./statement-financial-packet";

describe("statement financial packet", () => {
  beforeEach(() => queryPostgresRequired.mockReset());

  it("preserves source identity and reconciles every returned row into one packet", async () => {
    queryPostgresRequired.mockResolvedValue({ rows: [
      { id: "income", document_id: "doc-1", original_file_name: "jan.pdf", transaction_date: "2025-01-02", posted_date: null, description: "Rent payment", merchant_name: null, amount_cents: 100000, direction: "credit", balance_cents: null, suggested_category: "rent", is_transfer: false, transfer_reason: null, confidence: "0.98", status: "approved", allocation_target_label: "Property A", metadata_json: { counterpartyName: "Tenant" } },
      { id: "transfer", document_id: "doc-1", original_file_name: "jan.pdf", transaction_date: "2025-01-03", posted_date: null, description: "Transfer to bank", merchant_name: null, amount_cents: 60000, direction: "debit", balance_cents: null, suggested_category: null, is_transfer: true, transfer_reason: "own account", confidence: "1", status: "approved", allocation_target_label: null, metadata_json: {} },
    ] });

    const packet = await getStatementFinancialPacket("tenant-1", 2025, { projectId: "project-1" });

    expect(packet.totals).toMatchObject({ sourceRows: 2, creditCents: 100000, debitCents: 60000, incomeCents: 100000, transferCents: 60000 });
    expect(packet.packets.income[0]).toMatchObject({ id: "income", documentId: "doc-1", originalFileName: "jan.pdf", counterpartyName: "Tenant" });
    expect(Object.values(packet.packets).flat().map((row) => row.id).sort()).toEqual(["income", "transfer"]);
    expect(queryPostgresRequired.mock.calls[0][1]).toEqual(["tenant-1", 2025, "project-1", null]);
  });

  it("returns a reconciled empty packet only when the authoritative query succeeds with no rows", async () => {
    queryPostgresRequired.mockResolvedValue({ rows: [] });
    const packet = await getStatementFinancialPacket("tenant-1", 2025);
    expect(packet.totals).toMatchObject({ sourceRows: 0, debitCents: 0, creditCents: 0 });
    expect(Object.values(packet.packets).flat()).toEqual([]);
  });
});
