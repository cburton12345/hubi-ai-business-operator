import { describe, expect, it } from "vitest";
import { buildJobberResourceQuery, JOBBER_ANALYSIS_RESOURCES } from "./read-model";

describe("Jobber read model", () => {
  it("covers the operating records needed for whole-business analysis", () => {
    expect(JOBBER_ANALYSIS_RESOURCES.map((item) => item.objectType)).toEqual(["client", "request", "quote", "job", "invoice"]);
  });

  it("always requests bounded cursor pagination", () => {
    const query = buildJobberResourceQuery("job");
    expect(query).toContain("first: $first");
    expect(query).toContain("after: $after");
    expect(query).toContain("pageInfo { hasNextPage endCursor }");
    expect(query).not.toContain("mutation");
  });
});
