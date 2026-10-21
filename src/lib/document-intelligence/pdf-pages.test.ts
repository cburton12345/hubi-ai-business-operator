import { describe, expect, it } from "vitest";
import { groupPdfPages } from "./pdf-pages";

describe("groupPdfPages", () => {
  it("keeps page order, splits on source kind, and bounds group size", () => {
    const pages = [
      { pageNumber: 1, text: "a", kind: "text" as const },
      { pageNumber: 2, text: "b", kind: "text" as const },
      { pageNumber: 3, text: "", kind: "image" as const },
      { pageNumber: 4, text: "c", kind: "text" as const },
      { pageNumber: 5, text: "d", kind: "text" as const },
      { pageNumber: 6, text: "e", kind: "text" as const },
    ];
    expect(groupPdfPages(pages, 2).map((group) => [group.kind, group.pages.map((page) => page.pageNumber)]))
      .toEqual([["text", [1, 2]], ["image", [3]], ["text", [4, 5]], ["text", [6]]]);
  });
});
