import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  OWNER_EVENT_BODY_LIMIT_BYTES,
  ownerEventSchema,
  readBoundedJson,
} from "./owner-event-intake";

const validEvent = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  platformKey: "marketplacepro",
  platformName: "MarketplacePro",
  externalEventId: "mpp:test:1",
  eventType: "lead.new",
  title: "New contractor lead",
  summary: "A qualified contractor lead needs review.",
};

describe("owner event intake boundary", () => {
  it("requires tenant and source identity and rejects unsafe action links", () => {
    expect(ownerEventSchema.safeParse(validEvent).success).toBe(true);
    expect(ownerEventSchema.safeParse({ ...validEvent, tenantId: undefined }).success).toBe(false);
    expect(ownerEventSchema.safeParse({ ...validEvent, externalEventId: undefined }).success).toBe(false);
    expect(ownerEventSchema.safeParse({ ...validEvent, actionHref: "javascript:alert(1)" }).success).toBe(false);
    expect(ownerEventSchema.safeParse({ ...validEvent, actionHref: "//attacker.example/path" }).success).toBe(false);
    expect(ownerEventSchema.safeParse({ ...validEvent, actionHref: "/app/owner-command-center" }).success).toBe(true);
    expect(ownerEventSchema.safeParse({ ...validEvent, actionHref: "https://marketplacepro.live/app" }).success).toBe(true);
  });

  it("parses bounded streaming JSON and rejects declared or actual oversize bodies", async () => {
    const parsed = await readBoundedJson(new Request("https://ferocity.live/api/owner-command-center/events", {
      method: "POST",
      body: JSON.stringify(validEvent),
    }));
    expect(parsed).toEqual(validEvent);

    await expect(readBoundedJson(new Request("https://ferocity.live/api/owner-command-center/events", {
      method: "POST",
      headers: { "content-length": String(OWNER_EVENT_BODY_LIMIT_BYTES + 1) },
      body: "{}",
    }))).rejects.toMatchObject({ statusCode: 413 });

    await expect(readBoundedJson(new Request("https://ferocity.live/api/owner-command-center/events", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(OWNER_EVENT_BODY_LIMIT_BYTES) }),
    }))).rejects.toMatchObject({ statusCode: 413 });
  });

  it("keeps replay handling side-effect safe in both ordinary and concurrent paths", async () => {
    const route = await readFile(new URL("../../app/api/owner-command-center/events/route.ts", import.meta.url), "utf8");
    expect(route).toContain("push: \"not_repeated\"");
    expect(route).toContain("on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing");
    expect(route.indexOf("const existing = await queryPostgres")).toBeLessThan(route.indexOf("const triageDecision = await triageOwnerEvent"));
  });
});
