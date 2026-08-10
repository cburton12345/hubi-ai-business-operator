import { afterEach, describe, expect, it } from "vitest";
import { absoluteAppUrl } from "@/lib/http/safe-redirect";

const originalAppUrl = process.env.FEROCITY_APP_URL;
const originalPublicUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.FEROCITY_APP_URL = originalAppUrl;
  process.env.NEXT_PUBLIC_APP_URL = originalPublicUrl;
});

describe("absoluteAppUrl", () => {
  it("keeps authentication redirects on the configured public host", () => {
    process.env.FEROCITY_APP_URL = "https://ferocity.live";
    expect(absoluteAppUrl("/login?next=%2Fapp")).toBe("https://ferocity.live/login?next=%2Fapp");
  });

  it("rejects protocol-relative redirect targets", () => {
    process.env.FEROCITY_APP_URL = "https://ferocity.live";
    expect(absoluteAppUrl("//attacker.example/path")).toBe("https://ferocity.live/");
  });
});
