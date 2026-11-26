import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const suppliedPglitePath = "C:/Users/schem/Documents/Codex/2026-07-05/homes4rent-netlify-oauth-check-it-out/work/lease-tools/node_modules/@electric-sql/pglite/dist/index.js";
const pglitePath = process.env.PGLITE_DIST_PATH || suppliedPglitePath;
const hasPglite = fs.existsSync(pglitePath);
const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/293_trusted_device_sessions.sql"), "utf8");

let openDatabase;
afterEach(async () => {
  if (openDatabase) await openDatabase.close();
  openDatabase = undefined;
});

async function database() {
  const { PGlite } = await import(pathToFileURL(pglitePath).href);
  openDatabase = new PGlite();
  await openDatabase.exec(`
    create table public.app_sessions (
      id uuid primary key,
      user_id uuid not null,
      session_token_hash text not null unique,
      selected_tenant_id uuid,
      user_agent text,
      ip_address inet,
      expires_at timestamptz not null,
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    );
    insert into public.app_sessions(id,user_id,session_token_hash,expires_at,created_at) values
      ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','active',now()+interval '1 day',now()-interval '10 days'),
      ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','revoked',now()+interval '1 day',now()-interval '10 days');
    update public.app_sessions set revoked_at=now() where session_token_hash='revoked';
  `);
  return openDatabase;
}

describe.runIf(hasPglite)("migration 293 trusted device sessions", () => {
  it("extends only active sessions and installs bounded device constraints", async () => {
    const db = await database();
    await db.exec(migration);
    const evidence = await db.query(`
      select session_token_hash,
        expires_at > now()+interval '89 days' as extended,
        absolute_expires_at > expires_at as bounded,
        authentication_method
      from public.app_sessions order by session_token_hash
    `);
    expect(evidence.rows).toEqual([
      { session_token_hash: "active", extended: true, bounded: true, authentication_method: "password" },
      { session_token_hash: "revoked", extended: false, bounded: true, authentication_method: "password" },
    ]);
    await expect(db.exec("update public.app_sessions set authentication_method='pin' where session_token_hash='active'"))
      .rejects.toThrow(/app_sessions_authentication_method_check/i);
    await expect(db.exec(`update public.app_sessions set device_label='${"x".repeat(121)}' where session_token_hash='active'`))
      .rejects.toThrow(/app_sessions_device_label_length_check/i);
  });
});
