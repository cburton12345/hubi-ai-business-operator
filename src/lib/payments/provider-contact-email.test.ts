import { describe, expect, it } from "vitest";
import { isUsableProviderContactEmail } from "./provider-contact-email";

describe("isUsableProviderContactEmail", () => {
  it("accepts a real external business email", () => {
    expect(isUsableProviderContactEmail("owner@ferocity.live")).toBe(true);
  });

  it.each(["admin@hubi.local", "owner@example.com", "admin@localhost", "missing-at", ""]) (
    "rejects placeholder or internal address %s",
    (email) => expect(isUsableProviderContactEmail(email)).toBe(false)
  );
});
