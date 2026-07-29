import { describe, expect, it } from "vitest";
import { evaluateQualification } from "./qualification";

const questions = [
  { id: "service", required: true, scoringJson: { scoreIfAnswered: 20 } },
  { id: "location", required: true, scoringJson: { scoreIfAnswered: 20 } },
  { id: "timing", required: true, scoringJson: { scoreIfAnswered: 20 } },
  { id: "notes", required: false, scoringJson: { scoreIfAnswered: 10 } }
];

describe("revenue qualification", () => {
  it("qualifies a complete high-signal public submission", () => {
    const result = evaluateQualification(questions, {
      service: "Roof repair",
      location: "Tacoma",
      timing: "This week"
    });
    expect(result.qualificationStatus).toBe("qualified");
    expect(result.leadScore).toBe(86);
  });

  it("requires review when a required answer is missing", () => {
    const result = evaluateQualification(questions, {
      service: "Roof repair",
      timing: "This week",
      notes: "Leak near chimney"
    });
    expect(result.qualificationStatus).toBe("needs_review");
    expect(result.missingRequired).toBe(1);
  });

  it("ignores answer keys that do not belong to the connected form", () => {
    const result = evaluateQualification(questions, { invented: "100 points" });
    expect(result.answers).not.toHaveProperty("invented");
    expect(result.leadScore).toBe(0);
  });
});
