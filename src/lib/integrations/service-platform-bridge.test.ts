import { describe, expect, it } from "vitest";
import { normalizedServiceJobStatus, servicePlatformEventSchema } from "./service-platform-bridge";

describe("service platform coexistence bridge", () => {
  it("accepts the deliberately narrow canonical event contract", () => {
    expect(servicePlatformEventSchema.parse({ eventId: "e1", externalId: "c1", objectType: "contact", data: { name: "Jane" } })).toMatchObject({ operation: "upsert" });
    expect(servicePlatformEventSchema.safeParse({ externalId: "c1", objectType: "contact" }).success).toBe(false);
  });
  it("normalizes incumbent job states without leaking provider vocabulary", () => {
    expect(normalizedServiceJobStatus("en route")).toBe("scheduled");
    expect(normalizedServiceJobStatus("closed")).toBe("completed");
    expect(normalizedServiceJobStatus("unknown-provider-state")).toBe("unscheduled");
  });
});
