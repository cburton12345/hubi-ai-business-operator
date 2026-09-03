import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedH4rCallbackUrl } from "./callback";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "src", "app", "api", "integrations", "h4r", "sms", "route.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "204_h4r_ferocity_connect_bridge.sql"), "utf8");

describe("H4R signed SMS bridge safety contract", () => {
  it("derives one canonical send key from the mapped workspace and outbox row", () => {
    expect(route).toContain("`h4r:${input.workspace_id}:${input.sms_outbox_id}`");
    expect(route).toContain("mapping.status !== \"active\"");
    expect(route).toContain("humanApproved: false");
  });

  it("uses only the server-side mapped callback and fully redacts message bodies in diagnostics", () => {
    expect(route).toContain("const callbackUrl = mapping.callback_url;");
    expect(route).not.toContain("input.callback_url");
    expect(route).toContain('clone.body = "[redacted]"');
  });

  it("keeps every bridge table protected from browser roles", () => {
    expect(migration).toContain("alter table public.h4r_ferocity_bridge_nonces enable row level security");
    expect(migration).toContain("revoke all on table public.h4r_ferocity_bridge_nonces from anon, authenticated");
    expect(migration).toContain("callback_url text check (callback_url is null or callback_url ~ '^https://')");
  });

  it("accepts HTTPS callbacks and rejects unsafe URL schemes", () => {
    expect(isAllowedH4rCallbackUrl("https://example.com/functions/v1/ferocity-sms-callback")).toBe(true);
    expect(isAllowedH4rCallbackUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedH4rCallbackUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedH4rCallbackUrl("not a url")).toBe(false);
  });
});
