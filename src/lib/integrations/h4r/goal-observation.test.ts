import { describe, expect, it } from "vitest";
import { classifyH4rGoal, h4rGoalIdentity } from "./goal-observation";

describe("H4R persistent-goal observations", () => {
  it("maps collection promises to one durable collection goal", () => {
    const event = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      externalEventId: "promise-missed:1",
      eventType: "collection.promise_missed",
      title: "Tenant payment promise was missed",
      summary: "The promised rent payment did not arrive.",
      severity: "high" as const,
      metadata: {
        sourceWorkspaceId: "workspace-1",
        collectionCaseId: "case-1",
      },
    };
    expect(classifyH4rGoal(event).goalType).toBe("collection_resolution");
    expect(h4rGoalIdentity(event)).toMatchObject({
      goalKey: "h4r:workspace-1:collection_case:case-1",
      entityType: "collection_case",
      entityId: "case-1",
    });
  });

  it("maps property emergencies to maintenance outcome ownership", () => {
    const event = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      externalEventId: "urgent-heat:1",
      eventType: "maintenance.emergency",
      title: "Furnace is not working",
      summary: "Tenant reported no heat.",
      severity: "critical" as const,
      metadata: { sourceWorkspaceId: "workspace-1", unitId: "unit-3" },
    };
    expect(classifyH4rGoal(event).goalType).toBe("maintenance_resolution");
    expect(h4rGoalIdentity(event).goalKey).toBe("h4r:workspace-1:unit:unit-3");
  });

  it("falls back to an idempotent event-scoped goal when H4R omits an entity id", () => {
    const event = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      externalEventId: "system-failure:42",
      eventType: "system.delivery_failed",
      title: "Delivery failed",
      summary: "Provider delivery needs retry.",
      severity: "high" as const,
      metadata: { sourceWorkspaceId: "workspace-1" },
    };
    expect(h4rGoalIdentity(event)).toMatchObject({
      goalKey: "h4r:workspace-1:owner-event:system-failure:42",
      entityType: "owner_event",
    });
  });

  it("keeps aggregate brain observations on one durable workspace-domain goal", () => {
    const event = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      externalEventId: "context-snapshot:1",
      eventType: "context.collections.attention",
      title: "Balances need follow-through",
      summary: "Aggregate H4R state changed.",
      severity: "high" as const,
      metadata: { sourceWorkspaceId: "workspace-1", contextDomain: "collections" },
    };
    expect(h4rGoalIdentity(event)).toMatchObject({
      goalKey: "h4r:workspace-1:domain:collections",
      entityType: "workspace_domain",
      entityId: "workspace-1:collections",
    });
  });
});
