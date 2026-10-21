import { describe, expect, it } from "vitest";
import { evaluateOperationalHealth, type OperationalHealthCounts } from "./operational-health";

const healthyCounts: OperationalHealthCounts = {
  activeWorkflows: 8,
  workflowsMissingNextRun: 0,
  dueWorkflows: 0,
  recentAgentRuns: 4,
  stuckAgentRuns: 0,
  failedAgentRuns24h: 0,
  dueOutboundActions: 0,
  failedOutboundActions24h: 0,
  stuckIntegrationJobs: 0,
  failedIntegrationJobs24h: 0,
  stuckDocuments: 0,
  failedDocuments24h: 0,
  runtimeErrors24h: 0,
  unhealthyConnections: 0,
  staleLiveConnections: 0,
  overdueExpectedEvidence: 0,
  retryExhaustedExecutions: 0,
  fallbackExecutions1h: 0,
};

describe("operational health", () => {
  it("fails closed when health evidence is unavailable", () => {
    const result = evaluateOperationalHealth(null, "2026-10-20T00:00:00.000Z");
    expect(result.status).toBe("unknown");
    expect(result.unavailableReason).toContain("not treating the system as healthy");
  });

  it("reports healthy only when every monitored execution surface is healthy", () => {
    const result = evaluateOperationalHealth(healthyCounts);
    expect(result.status).toBe("healthy");
    expect(result.components).toHaveLength(8);
    expect(result.components.every((item) => item.status === "healthy")).toBe(true);
  });

  it("detects missing expected evidence and exhausted retries", () => {
    const result = evaluateOperationalHealth({ ...healthyCounts, overdueExpectedEvidence: 2, retryExhaustedExecutions: 1 });
    expect(result.status).toBe("critical");
    expect(result.components.find((item) => item.key === "execution_evidence")?.status).toBe("critical");
  });

  it("detects zero-result anomalies only when scheduled work is actually due", () => {
    const dueWithoutEvidence = evaluateOperationalHealth({ ...healthyCounts, dueWorkflows: 2, recentAgentRuns: 0 });
    expect(dueWithoutEvidence.status).toBe("critical");
    expect(dueWithoutEvidence.components[0].summary).toContain("no recent run evidence");

    const noExpectedWork = evaluateOperationalHealth({ ...healthyCounts, recentAgentRuns: 0 });
    expect(noExpectedWork.status).toBe("healthy");
  });

  it("distinguishes fallback spikes and stale providers from stuck jobs", () => {
    const degraded = evaluateOperationalHealth({ ...healthyCounts, fallbackExecutions1h: 3, staleLiveConnections: 1 });
    expect(degraded.status).toBe("degraded");
    const critical = evaluateOperationalHealth({ ...healthyCounts, stuckIntegrationJobs: 1 });
    expect(critical.status).toBe("critical");
  });
});
