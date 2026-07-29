import { describe, expect, it } from "vitest";
import { createQuoteShortcutHref } from "./shortcuts";

describe("createQuoteShortcutHref", () => {
  it("opens the estimate form directly", () => {
    expect(createQuoteShortcutHref()).toBe("/app/service?action=create-estimate#create-estimate");
  });

  it("can preserve customer and safe back path", () => {
    expect(createQuoteShortcutHref({ customerId: "cust_1", backTo: "/app/leads/lead_1" })).toBe(
      "/app/service?action=create-estimate&customerId=cust_1&backTo=%2Fapp%2Fleads%2Flead_1#create-estimate"
    );
  });
});
