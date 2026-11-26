import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("trusted session continuity contract", () => {
  it("renews only live, unrevoked, same-origin sessions within a hard ceiling", async () => {
    const route = await readFile(new URL("../../app/api/auth/session/refresh/route.ts", import.meta.url), "utf8");
    expect(route).toContain("requestIsSameOrigin(request)");
    expect(route).toContain("revoked_at is null");
    expect(route).toContain("expires_at > now()");
    expect(route).toContain("absolute_expires_at > now()");
    expect(route).toContain("least(now() + interval '90 days', absolute_expires_at)");
    expect(route).toContain('"cache-control": "no-store, private"');
  });

  it("keeps revocation scoped to the signed-in user and preserves the current device", async () => {
    const actions = await readFile(new URL("../../app/app/devices/actions.ts", import.meta.url), "utf8");
    expect(actions).toContain("parsed.data.sessionId === session.sessionId");
    expect(actions).toContain("where id=$1 and user_id=$2");
    expect(actions).toContain("where user_id=$1 and id<>$2");
    expect(actions).toContain("queryPostgresRequired");
  });

  it("fails closed if the initial trusted session cannot be persisted", async () => {
    const login = await readFile(new URL("../../app/login/actions.ts", import.meta.url), "utf8");
    const session = await readFile(new URL("./session.ts", import.meta.url), "utf8");
    expect(login).toContain('redirect(loginErrorUrl("unavailable"');
    expect(login).toContain("returning id");
    expect(session).toContain("s.absolute_expires_at is null or s.absolute_expires_at > now()");
  });
});
