import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { consumeLocalPasswordReset,issueLocalPasswordReset } from "./password-reset-token";

function harness() {
  const state = { token: null as null | { id: string;user_id: string;token_hash: string;status: string },credentialUpdates: 0,queries: [] as string[] };
  return {
    state,
    client: {
      async query<T>(sql: string,values: unknown[] = []) {
        state.queries.push(sql);
        if (sql.startsWith("select user_id from public.user_password_credentials")) {
          return { rows: [{ user_id: String(values[0]) } as T],rowCount: 1 };
        }
        if (sql.startsWith("update public.password_reset_tokens set status='revoked'")) {
          if (state.token?.status === "pending") state.token.status="revoked";
          return { rows: [] as T[],rowCount: 1 };
        }
        if (sql.startsWith("insert into public.password_reset_tokens")) {
          state.token={ id: "reset-a",user_id: String(values[1]),token_hash: String(values[2]),status: "pending" };
          return { rows: [{ token_hash: values[2] } as T],rowCount: 1 };
        }
        if (sql.startsWith("select id,user_id from public.password_reset_tokens")) {
          const token=state.token;
          const byTokenHash=sql.includes("where token_hash=$1");
          const row=token?.status === "pending" && (byTokenHash ? token.token_hash === values[0] : token.id === values[0] && token.user_id === values[1]) ? token : null;
          return { rows: row ? [row as T] : [],rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith("update public.user_password_credentials")) {
          state.credentialUpdates+=1;return { rows: [] as T[],rowCount: 1 };
        }
        if (sql.includes("where id=$1 and status='pending'")) {
          const token=state.token;
          if (token !== null && token.id === values[0] && token.status === "pending") { token.status="consumed";return { rows: [] as T[],rowCount: 1 }; }
          return { rows: [] as T[],rowCount: 0 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }
    }
  };
}

describe("single-purpose password reset tokens",() => {
  it("issues and consumes a reset once without writing invitation or membership tables",async () => {
    const test=harness();
    await issueLocalPasswordReset(test.client as never,{ tenantId: "tenant-a",userId: "user-a",tokenHash: "reset-hash",language: "en" });
    expect(await consumeLocalPasswordReset(test.client as never,{ tokenHash: "reset-hash",passwordHash: "hash",passwordSalt: "salt",passwordIterations: 120000 })).toEqual({ outcome: "updated",userId: "user-a" });
    expect(await consumeLocalPasswordReset(test.client as never,{ tokenHash: "reset-hash",passwordHash: "other",passwordSalt: "other",passwordIterations: 120000 })).toEqual({ outcome: "invalid" });
    expect(test.state.credentialUpdates).toBe(1);
    expect(test.state.queries.filter((sql) => sql.includes("user_password_credentials where user_id=$1 for update"))).toHaveLength(2);
    expect(test.state.queries).toContain("update public.password_reset_tokens set status='revoked',revoked_at=now()\n     where user_id=$1 and status='pending'");
    expect(test.state.queries.join("\n")).not.toMatch(/workspace_invites|tenant_users|operations_workers/);
  });

  it("keeps invitation consumers and reset consumers on distinct tables and routes",() => {
    const resetAction=readFileSync("src/app/reset-password/actions.ts","utf8");
    const resetConsume=readFileSync("src/app/reset-password/[token]/actions.ts","utf8");
    const inviteAction=readFileSync("src/app/invite/[token]/actions.ts","utf8");
    expect(resetAction).toContain("issueLocalPasswordReset");
    expect(resetAction).not.toContain("workspace_invites");
    expect(resetConsume).toContain("consumeLocalPasswordReset");
    expect(inviteAction).toContain("workspace_invites");
    expect(inviteAction).not.toContain("password_reset_tokens");
  });

  it("fails closed on relation collisions and removes inherited browser privileges",() => {
    const migration=readFileSync("supabase/migrations/281_password_reset_token_separation.sql","utf8");
    expect(migration).toContain("if to_regclass('public.password_reset_tokens') is not null then");
    expect(migration).toContain("create unique index password_reset_tokens_one_pending_user_idx");
    expect(migration).toContain("has_table_privilege(role_name,relation_oid,'TRIGGER')");
    expect(migration).toContain("has_column_privilege(role_name,relation_oid,column_name,'UPDATE')");
  });
});
