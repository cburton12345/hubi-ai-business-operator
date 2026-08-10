import { describe, expect, it } from "vitest";
import { isSafePublicHref, normalizeDemoEmbedUrl } from "./featured-demo";

describe("normalizeDemoEmbedUrl", () => {
  it("accepts secure direct video files", () => {
    expect(normalizeDemoEmbedUrl("direct_video", "https://cdn.example.com/demo.mp4?version=2"))
      .toBe("https://cdn.example.com/demo.mp4?version=2");
  });

  it("rejects insecure and non-video direct URLs", () => {
    expect(normalizeDemoEmbedUrl("direct_video", "http://cdn.example.com/demo.mp4")).toBeNull();
    expect(normalizeDemoEmbedUrl("direct_video", "https://example.com/page")).toBeNull();
  });

  it("converts supported YouTube links to privacy-enhanced embeds", () => {
    expect(normalizeDemoEmbedUrl("youtube", "https://youtu.be/dQw4w9WgXcQ"))
      .toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("converts Vimeo links and rejects arbitrary iframe hosts", () => {
    expect(normalizeDemoEmbedUrl("vimeo", "https://vimeo.com/123456789"))
      .toBe("https://player.vimeo.com/video/123456789");
    expect(normalizeDemoEmbedUrl("youtube", "https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("isSafePublicHref", () => {
  it("allows local paths, query strings, and same-page anchors", () => {
    expect(isSafePublicHref("/subscribe?plan=growth")).toBe(true);
    expect(isSafePublicHref("#plans")).toBe(true);
  });

  it("rejects external, protocol-relative, and script destinations", () => {
    expect(isSafePublicHref("https://example.com")).toBe(false);
    expect(isSafePublicHref("//example.com")).toBe(false);
    expect(isSafePublicHref("javascript:alert(1)")).toBe(false);
  });
});
