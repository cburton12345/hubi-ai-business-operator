import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("managed video billing safety", () => {
  it("does not create the customer charge until provider completion", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/app/marketing-os/video/[videoJobId]/actions.ts"),
      "utf8"
    );
    const submit = source.split("export async function submitVideoRenderAction")[1]
      .split("export async function refreshVideoRenderAction")[0];
    const refresh = source.split("export async function refreshVideoRenderAction")[1]
      .split("export async function createVideoVariationAction")[0];

    expect(submit).not.toContain("insert into public.billing_usage_charges");
    expect(submit).toContain("awaiting_successful_completion");
    expect(refresh).toContain("where $4");
    expect(refresh).toContain("void_provider_failed");
    expect(refresh).toContain("insert into public.billing_usage_charges");
  });
});
