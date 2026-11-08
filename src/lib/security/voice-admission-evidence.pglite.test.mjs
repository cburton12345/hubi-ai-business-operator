import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const suppliedPglitePath = "C:/Users/schem/Documents/Codex/2026-07-05/homes4rent-netlify-oauth-check-it-out/work/lease-tools/node_modules/@electric-sql/pglite/dist/index.js";
const pglitePath = process.env.PGLITE_DIST_PATH || suppliedPglitePath;
const hasPglite = fs.existsSync(pglitePath);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/272_voice_admission_evidence_hardening.sql"),
  "utf8"
);

let openDatabase;
afterEach(async () => {
  if (openDatabase) await openDatabase.close();
  openDatabase = undefined;
});
describe.runIf(hasPglite)("migration 272 server-owned voice admission evidence", () => {
  it("preserves tenant reads while making call evidence server-write-only", async () => {
    const { PGlite } = await import(pathToFileURL(pglitePath).href);
    const db = openDatabase = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create function public.has_tenant_role(p_tenant_id uuid,p_roles text[])
      returns boolean language sql stable as $$
        select p_tenant_id::text=current_setting('app.tenant_id',true)
          and current_setting('app.tenant_role',true)=any(p_roles)
      $$;
      create table public.receptionist_calls(
        id text primary key,tenant_id uuid not null,provider_key text not null,
        provider_call_id text not null,metadata_json jsonb not null default '{}'::jsonb,
        unique(provider_key,provider_call_id)
      );
      alter table public.receptionist_calls enable row level security;
      create policy receptionist_calls_tenant_operator on public.receptionist_calls for all
        using(public.has_tenant_role(tenant_id,array['owner','admin','operator']))
        with check(public.has_tenant_role(tenant_id,array['owner','admin','operator']));
      grant select,insert,update,delete on public.receptionist_calls to anon,authenticated;
      grant update(metadata_json) on public.receptionist_calls to public,anon,authenticated;
      insert into public.receptionist_calls values
        ('own','00000000-0000-0000-0000-000000000001','retell_voice','call-own','{}'),
        ('foreign','00000000-0000-0000-0000-000000000002','retell_voice','call-foreign','{}');
      begin;
      ${migration}
      commit;
    `);

    await db.exec(`set role authenticated;
      set app.tenant_id='00000000-0000-0000-0000-000000000001';
      set app.tenant_role='owner';`);
    expect((await db.query("select id from public.receptionist_calls order by id")).rows).toEqual([{ id: "own" }]);
    await expect(db.exec("update public.receptionist_calls set admission_pricing_snapshot_json='{}'"))
      .rejects.toThrow(/permission denied/i);
    await db.exec("reset role; set role service_role");
    await db.exec(`update public.receptionist_calls
      set admission_pricing_snapshot_json='{"policyId":"policy-1"}'::jsonb where id='own'`);
    expect((await db.query("select admission_pricing_snapshot_json from public.receptionist_calls where id='own'")).rows)
      .toEqual([{ admission_pricing_snapshot_json: { policyId: "policy-1" } }]);
  });
});

