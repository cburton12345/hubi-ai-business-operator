import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  const access = await client.query(`
    select ar.id, nullif(ar.metadata_json->>'workspaceId', '')::uuid as tenant_id, ar.email
    from public.access_requests ar
    where lower(ar.email) like 'ferocity-smoke-%@ferocity.live'
      and ar.created_at >= now() - interval '24 hours'
    for update
  `);
  const grader = await client.query(`
    select report_token, email
    from public.website_grader_reports
    where lower(email) like 'ferocity-grader-%@ferocity.live'
      and created_at >= now() - interval '24 hours'
    for update
  `);
  const eventIds = [
    ...access.rows.map((row) => `access-request:${row.id}`),
    ...grader.rows.map((row) => `business-grader:${row.report_token}`)
  ];
  const emails = [...access.rows.map((row) => row.email), ...grader.rows.map((row) => row.email)];
  const tenantIds = access.rows.map((row) => row.tenant_id).filter(Boolean);
  if (eventIds.length) await client.query(`delete from public.owner_command_events where external_event_id = any($1::text[])`, [eventIds]);
  if (emails.length) await client.query(`delete from public.leads where lower(email) = any($1::text[])`, [emails.map((email) => email.toLowerCase())]);
  if (grader.rows.length) await client.query(`delete from public.website_grader_reports where report_token = any($1::text[])`, [grader.rows.map((row) => row.report_token)]);
  if (access.rows.length) await client.query(`delete from public.access_requests where id = any($1::uuid[])`, [access.rows.map((row) => row.id)]);
  if (tenantIds.length) await client.query(`delete from public.tenants where id = any($1::uuid[])`, [tenantIds]);
  await client.query("commit");
  console.log(`Customer smoke cleanup removed ${access.rows.length} workspace request(s) and ${grader.rows.length} grader report(s).`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
