import { describe, expect, it } from "vitest";
import { assertCompanionActionPermitted, homes4RentCompanionContract } from "./companion-product-contract";

describe("companion product contract", () => {
  it("makes H4R authoritative across every protected rental domain", () => {
    expect(homes4RentCompanionContract.domains.map((domain) => domain.key)).toEqual(expect.arrayContaining([
      "portfolio", "leasing", "payments", "collections", "documents", "notices", "communications", "providers",
    ]));
    expect(homes4RentCompanionContract.forbiddenDirectActions).toEqual(expect.arrayContaining([
      "edit_ledger_balance", "post_or_reverse_payment", "change_rent_calculation", "mark_lease_signed", "alter_signature_evidence",
    ]));
  });

  it("allows minimized reads without manufacturing write authority", () => {
    expect(assertCompanionActionPermitted({ productKey: "h4r", actionKey: "read_context", requestedMode: "read" }).mode).toBe("read");
    expect(() => assertCompanionActionPermitted({ productKey: "h4r", actionKey: "analyze_lease_document", requestedMode: "execute", idempotencyKey: "x", approvalGatePresent: true }))
      .toThrow("cannot execute directly");
  });

  it("blocks payment, ledger, rent, and signature mutations even when execution is requested", () => {
    for (const actionKey of ["edit_ledger_balance", "post_or_reverse_payment", "change_rent_calculation", "mark_lease_signed", "alter_signature_evidence"]) {
      expect(() => assertCompanionActionPermitted({ productKey: "h4r", actionKey, requestedMode: "execute", idempotencyKey: "forced", approvalGatePresent: true, systemWorkflow: true }))
        .toThrow("forbidden");
    }
  });

  it("permits the existing H4R operator only as an idempotent, approval-gated authoritative workflow", () => {
    expect(() => assertCompanionActionPermitted({ productKey: "h4r", actionKey: "run_authorized_operator", requestedMode: "execute", idempotencyKey: "run", systemWorkflow: true }))
      .toThrow("approval gate");
    expect(assertCompanionActionPermitted({
      productKey: "h4r", actionKey: "run_authorized_operator", requestedMode: "execute",
      idempotencyKey: "run", approvalGatePresent: true, systemWorkflow: true, authoritativeVerificationPresent: true,
    }).mode).toBe("system_workflow_only");
  });

  it("requires an authoritative-system verification receipt before protected H4R execution", () => {
    expect(() => assertCompanionActionPermitted({
      productKey: "h4r", actionKey: "record_owner_confirmed_payment", requestedMode: "execute",
      idempotencyKey: "payment-proposal", approvalGatePresent: true, systemWorkflow: true,
    })).toThrow("requires verification from h4r");
  });
});
