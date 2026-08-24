import { describe, expect, it } from "vitest";
import { FacebookAssistedConnector, interpretFacebookSurface } from "./facebook-assisted-connector";

describe("Facebook assisted connector", () => {
  it("isolates surface interpretation and refuses unknown UI", () => {
    expect(interpretFacebookSurface({ url: "https://www.facebook.com/groups/123", connectorVersion: "1" }).surface).toBe("group");
    expect(interpretFacebookSurface({ url: "https://www.facebook.com/something-new", connectorVersion: "1" }).state).toBe("connector_incompatible");
  });

  it("pauses when verification is detected", () => {
    expect(interpretFacebookSurface({ url: "https://www.facebook.com/groups/123", connectorVersion: "1", verificationPromptDetected: true }).state).toBe("verification_required");
  });

  it("never reports an assisted action as published", async () => {
    const result = await new FacebookAssistedConnector().execute({ tenantId: "t", brandId: "b", identityId: "i", idempotencyKey: "k" }, { capability: "comment", payload: {} });
    expect(result.status).toBe("needs_human");
    expect(result.ok).toBe(false);
  });
});
