import fs from "node:fs";
import pg from "pg";

for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const result = await client.query(`
    select ar.email, ar.status, ar.metadata_json->'emailNotifications' as emails,
           ar.metadata_json->>'liveActionsEnabled' as live_actions,
           t.slug, t.account_type, t.billing_status, t.plan_key,
           (select count(*) from public.tenant_users tu where tu.tenant_id = t.id)::int as users,
           (select count(*) from public.workspace_invites wi where wi.tenant_id = t.id)::int as invites
    from public.access_requests ar
    join public.tenants t on t.id = (ar.metadata_json->>'workspaceId')::uuid
    where ar.email like 'ferocity-smoke-%@ferocity.live'
    order by ar.created_at desc
    limit 1
  `);
  const row = result.rows[0];
  if (!row) throw new Error("No smoke access request found.");

  const emails = row.emails || {};
  console.log(JSON.stringify({
    email: row.email,
    status: row.status,
    workspace: row.slug,
    accountType: row.account_type,
    plan: row.plan_key,
    billing: row.billing_status,
    liveActionsEnabled: row.live_actions,
    users: row.users,
    invites: row.invites,
    requesterEmailOk: Boolean(emails.requester?.ok),
    adminEmailOk: Boolean(emails.admin?.ok),
    requesterSkipped: Boolean(emails.requester?.skipped),
    adminSkipped: Boolean(emails.admin?.skipped),
    requesterError: emails.requester?.error || null,
    adminError: emails.admin?.error || null
  }, null, 2));
} finally {
  await client.end();
}
