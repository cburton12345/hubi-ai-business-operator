import pg from "pg";

async function main() {
  const connectionString = process.env.H4R_AUDIT_DATABASE_URL;
  if (!connectionString) throw new Error("H4R_AUDIT_DATABASE_URL is required.");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000, statement_timeout: 30_000, application_name: "h4r-insurance-read-only-audit" });
  await client.connect();
  try {
  await client.query("begin read only");
  const tables = await client.query<{ table_name: string; row_security: boolean }>(`
    select c.relname table_name,c.relrowsecurity row_security
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[]) order by c.relname`, [[
      "tenant_documents", "tenant_insurance_records", "insurance_reminder_settings", "insurance_reminder_events",
      "owner_notifications", "lease_templates", "tenants", "units", "properties",
    ]]);
  const constraints = await client.query<{ table_name: string; constraint_name: string; definition: string }>(`
    select c.relname table_name,con.conname constraint_name,pg_get_constraintdef(con.oid) definition
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[]) and con.contype='c' order by c.relname,con.conname`, [["tenant_documents","owner_notifications","lease_templates"]]);
  const functions = await client.query<{ function_name: string; argument_types: string }>(`
    select p.proname function_name,pg_get_function_identity_arguments(p.oid) argument_types
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any($1::text[]) order by p.proname`, [[
      "h4r_can_manage_tenant_records", "save_tenant_insurance", "set_insurance_reminders", "queue_insurance_reminders", "run_insurance_reminders",
    ]]);
  const extensions = await client.query<{ extension_name: string; schema_name: string }>(`
    select e.extname extension_name,n.nspname schema_name from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname in ('pgcrypto','pg_cron') order by e.extname`);
  const templates = await client.query<{ active_templates: string; insurance_marker_templates: string; safely_bounded_templates: string }>(`
    select count(*) filter(where is_active)::text active_templates,
      count(*) filter(where is_active and body_md like '%13. Tenant Insurance:%')::text insurance_marker_templates,
      count(*) filter(where is_active and body_md like '%13. Tenant Insurance:%' and strpos(substring(body_md from strpos(body_md,'13. Tenant Insurance:')),'14.')>1)::text safely_bounded_templates
    from public.lease_templates`);
  const counts = await client.query<{ insurance_records: string; reminder_settings: string; reminder_events: string }>(`
    select (select count(*) from public.tenant_insurance_records)::text insurance_records,
      (select count(*) from public.insurance_reminder_settings)::text reminder_settings,
      (select count(*) from public.insurance_reminder_events)::text reminder_events`);
  await client.query("rollback");
  console.log(JSON.stringify({
    tables: tables.rows, constraints: constraints.rows, functions: functions.rows,
    extensions: extensions.rows, templates: templates.rows[0], counts: counts.rows[0],
  }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main();
