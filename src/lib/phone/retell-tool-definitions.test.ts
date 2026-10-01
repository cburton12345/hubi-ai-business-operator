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

  it("routes only to the tenant's configured human destination", () => {
    const transfer = retellBusinessTools("https://ferocity.live", "+17155550123")
      .find((tool) => tool.name === "transfer_to_business");

    expect(transfer).toMatchObject({
      type: "transfer_call",
      transfer_destination: {
        type: "predefined",
        number: "+17155550123",
        ignore_e164_validation: false
      },
      transfer_option: { type: "cold_transfer", show_transferee_as_caller: false }
    });
  });

  it("creates separate tenant-scoped tools for departments and people", () => {
    const tools = retellBusinessTools("https://ferocity.live", [
      { label: "Office", role: "office", phoneNumber: "+17155550111", priority: 10, weekdays: [1, 2, 3, 4, 5], availableStart: "08:00", availableEnd: "17:00", timezone: "America/Chicago", isPrimary: true },
      { label: "On-call tech", role: "on_call", phoneNumber: "+17155550222", priority: 20, weekdays: [0, 1, 2, 3, 4, 5, 6], availableStart: null, availableEnd: null, timezone: "America/Chicago", isPrimary: false }
    ]).filter((tool) => tool.type === "transfer_call");

    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => tool.name)).toEqual(["transfer_to_office", "transfer_to_on_call_tech"]);
    expect(tools.map((tool) => (tool.transfer_destination as { number: string }).number))
      .toEqual(["+17155550111", "+17155550222"]);
  });
});
