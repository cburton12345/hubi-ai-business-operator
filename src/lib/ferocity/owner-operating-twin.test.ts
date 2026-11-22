import { describe, expect, it } from "vitest";
import { buildOwnerTwinSuggestions, ownerCommandFamily } from "@/lib/ferocity/owner-operating-twin";

describe("owner operating twin suggestions", () => {
  it("preserves the owner's wording and learns repeated next-command sequences", () => {
    const suggestions = buildOwnerTwinSuggestions([
      { body: "whats left with everything", succeeded: true },
      { body: "keep going and do the next things", succeeded: true },
      { body: "what is left on all platforms", succeeded: true },
      { body: "keep going and do the next things", succeeded: true },
      { body: "whats next with everything", succeeded: true },
    ], { command: "Audit the current business and choose the next move.", title: "Audit the business" });
    expect(suggestions[0]?.command).toBe("keep going and do the next things");
    expect(suggestions[0]?.confidence).toBeGreaterThan(0.7);
  });

  it("never learns credentials and keeps consequential suggestions draft-only", () => {
    const suggestions = buildOwnerTwinSuggestions([
      { body: "password is do-not-store-this", succeeded: true },
      { body: "send the customer an email", succeeded: true },
      { body: "check new leads", succeeded: true },
      { body: "send the customer an email", succeeded: true },
      { body: "check new leads", succeeded: true },
    ], { command: "Review current leads without contacting anyone.", title: "Review leads" });
    expect(suggestions.some((item) => item.command.includes("password"))).toBe(false);
    expect(suggestions.find((item) => item.command.includes("send the customer"))?.executionMode).toBe("draft_only");
  });

  it("classifies the owner's terse continuation language", () => {
    expect(ownerCommandFamily("ok lets keep going whats next")).toBe("continue");
  });
});

