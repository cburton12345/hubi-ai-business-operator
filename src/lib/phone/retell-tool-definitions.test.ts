import { describe, expect, it } from "vitest";
import { retellBusinessTools } from "./retell-tool-definitions";

describe("retellBusinessTools", () => {
  it("always gives the receptionist a safe way to finish a completed call", () => {
    const tools = retellBusinessTools("https://ferocity.live");
    expect(tools.some((tool) => tool.type === "end_call" && tool.name === "end_call")).toBe(true);
  });

  it("keeps transfer optional and only accepts a valid E.164 destination", () => {
    expect(retellBusinessTools("https://ferocity.live", "not-a-number").some((tool) => tool.type === "transfer_call")).toBe(false);
    expect(retellBusinessTools("https://ferocity.live", "+17155550123").some((tool) => tool.type === "transfer_call")).toBe(true);
  });
});

