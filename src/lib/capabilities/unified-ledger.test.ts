import { describe, expect, it } from "vitest";
import executionContractsJson from "./execution-contracts.json";
import providerTruthJson from "@/lib/integrations/provider-capability-truth.json";
import { ferocityCommandCapabilities } from "@/lib/ai-workforce/command-understanding";
import { listBusinessActionDefinitions } from "@/lib/business-actions/catalog";
import { listServiceFeatureDefinitions } from "@/lib/controls/service-gates";
import { publicFerocityCapabilities } from "@/lib/public-site/ferocity-capabilities";
import { buildUnifiedCapabilityLedger, summarizeUnifiedCapabilityLedger } from "./unified-ledger";

describe("unified capability ledger", () => {
  const ledger = buildUnifiedCapabilityLedger();

  it("contains every fragmented capability inventory", () => {
    const summary = summarizeUnifiedCapabilityLedger(ledger);
    expect(summary.bySource.public_outcome).toBe(publicFerocityCapabilities.length);
    expect(summary.bySource.service_feature).toBe(listServiceFeatureDefinitions().length);
    expect(summary.bySource.command_family).toBe(ferocityCommandCapabilities.length);
    expect(summary.bySource.business_action).toBe(listBusinessActionDefinitions().length);
    expect(summary.bySource.execution_contract).toBe(Object.keys(executionContractsJson.contracts).length);
    expect(summary.bySource.provider).toBe(Object.keys(providerTruthJson.providers).length);
  });

  it("never treats a registered feature or command as production-certified by existence alone", () => {
    const unproven = ledger.filter((entry) => entry.source === "service_feature" || entry.source === "command_family");
    expect(unproven.length).toBeGreaterThan(0);
    expect(unproven.every((entry) => entry.evidenceState === "implemented_unverified")).toBe(true);
  });

  it("keeps public links on known application paths", () => {
    const invalid = ledger.filter((entry) => entry.href && !entry.href.startsWith("/"));
    expect(invalid).toEqual([]);
  });

  it("does not make production claims for blocked or connection-required providers", () => {
    const constrained = ledger.filter((entry) =>
      entry.evidenceState === "provider_approval_required" || entry.evidenceState === "customer_connection_required"
    );
    expect(constrained.length).toBeGreaterThan(0);
    expect(constrained.every((entry) => !entry.allowedClaim.includes("production-certified"))).toBe(true);
  });
});
