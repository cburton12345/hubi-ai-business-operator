import { describe, expect, it } from "vitest";
import { detectWebsitePlatformHints } from "./website-import-processor";

describe("website platform detection", () => {
  it("recognizes common CMS hints without claiming an adapter is connected", () => {
    expect(detectWebsitePlatformHints('<link href="/wp-content/themes/site/style.css">', "https://example.com")).toEqual(["wordpress"]);
    expect(detectWebsitePlatformHints('<body data-wf-page="abc"><link href="site.webflow.css">', "https://example.webflow.io")).toEqual(["webflow"]);
    expect(detectWebsitePlatformHints('<script src="https://cdn.shopify.com/theme.js"></script>', "https://store.myshopify.com")).toEqual(["shopify"]);
  });
});
