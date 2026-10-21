import { describe, expect, it } from "vitest";
import { pairFerocityChatMessages } from "./pair-chat-messages";

describe("pairFerocityChatMessages", () => {
  it("pairs each answer only with its immediately preceding owner turn", () => {
    const result = pairFerocityChatMessages([
      { id: "owner-1", role: "owner" as const },
      { id: "answer-1", role: "ferocity" as const },
      { id: "owner-2", role: "owner" as const },
      { id: "answer-2", role: "ferocity" as const },
    ]);
    expect(result.map((item) => [item.owner.id, item.answer?.id])).toEqual([
      ["owner-1", "answer-1"],
      ["owner-2", "answer-2"],
    ]);
  });

  it("does not borrow an answer from the following owner exchange", () => {
    const result = pairFerocityChatMessages([
      { id: "owner-incomplete", role: "owner" as const },
      { id: "owner-next", role: "owner" as const },
      { id: "answer-next", role: "ferocity" as const },
    ]);
    expect(result[0]?.answer).toBeNull();
    expect(result[1]?.answer?.id).toBe("answer-next");
  });
});
