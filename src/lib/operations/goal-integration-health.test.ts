import { describe, expect, it } from "vitest";
import { mapGoalIntegrationHealth } from "./goal-integration-health";

describe("operating-goal integration health", () => {
  it("satisfies an available connection without enabling consequential actions", () => {
    expect(mapGoalIntegrationHealth({
      referenceTable: "provider_connection_lanes",
      connectionStatus: "connected",
      credentialsStatus: "configured",
      liveActionsEnabled: false,
    })).toMatchObject({ status: "satisfied" });
  });

  it("blocks expired and revoked credentials", () => {
    expect(mapGoalIntegrationHealth({
      referenceTable: "provider_accounts",
      connectionStatus: "connected",
      credentialsStatus: "expired",
    })).toMatchObject({ status: "blocked" });
  });

  it("keeps a merely paired Connect device waiting for active health", () => {
    expect(mapGoalIntegrationHealth({
      referenceTable: "ferocity_connect_devices",
      connectionStatus: "paired",
    })).toMatchObject({ status: "waiting" });
  });

  it("restores healthy mailbox and owner-platform dependencies", () => {
    expect(mapGoalIntegrationHealth({ referenceTable: "mailbox_connections", connectionStatus: "syncing" }).status).toBe("satisfied");
    expect(mapGoalIntegrationHealth({ referenceTable: "owner_platform_connections", connectionStatus: "connected" }).status).toBe("satisfied");
  });
});
