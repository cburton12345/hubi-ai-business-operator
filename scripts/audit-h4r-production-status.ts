import pg from "pg";

async function main() {
  const connectionString = process.env.H4R_AUDIT_DATABASE_URL;
  if (!connectionString) throw new Error("H4R_AUDIT_DATABASE_URL is required.");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000, statement_timeout: 30_000, application_name: "h4r-production-read-only-status" });
  await client.connect();
  try {
    await client.query("begin read only");
    const columnsResult = await client.query<{ table_name: string; column_name: string }>(`
      select table_name,column_name from information_schema.columns
      where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position`, [[
        "sms_outbox", "leases", "rental_applications", "workspace_messaging_connectors",
      ]]);
    const columns = new Map<string, Set<string>>();
    for (const row of columnsResult.rows) {
      const set = columns.get(row.table_name) ?? new Set<string>(); set.add(row.column_name); columns.set(row.table_name, set);
    }
    const output: Record<string, unknown> = { inspectedTables: [...columns.keys()] };
    const sms = columns.get("sms_outbox");
    if (sms?.has("sent") && sms.has("created_at")) {
      const sentAt = sms.has("sent_at") ? "max(sent_at) filter(where sent) latest_sent_at," : "null::timestamptz latest_sent_at,";
      const lastError = sms.has("last_error") ? "count(*) filter(where not sent and nullif(last_error,'') is not null)::int failed_with_error" : "0::int failed_with_error";
      output.sms = (await client.query(`select count(*)::int seven_day_total,count(*) filter(where sent)::int sent,count(*) filter(where not sent)::int pending,${sentAt}${lastError} from public.sms_outbox where created_at>=now()-interval '7 days'`)).rows[0];
      const statusExpression = sms.has("twilio_status") && sms.has("provider_status")
        ? "lower(coalesce(twilio_status,provider_status,'unconfirmed'))"
        : sms.has("provider_status") ? "lower(coalesce(provider_status,'unconfirmed'))"
        : sms.has("twilio_status") ? "lower(coalesce(twilio_status,'unconfirmed'))" : null;
      if (statusExpression) output.smsProviderStatuses = (await client.query(`select ${statusExpression} status,count(*)::int messages from public.sms_outbox where created_at>=now()-interval '7 days' group by 1 order by 1`)).rows;
    }
    const leases = columns.get("leases");
    if (leases?.has("status")) output.leases = (await client.query(`select status,count(*)::int records from public.leases group by status order by status`)).rows;
    const applications = columns.get("rental_applications");
    if (applications) {
      const timeColumn = applications.has("created_at") ? "created_at" : applications.has("submitted_at") ? "submitted_at" : null;
      if (timeColumn) output.applications = (await client.query(`select count(*)::int seven_day_total,max(${timeColumn}) latest_at from public.rental_applications where ${timeColumn}>=now()-interval '7 days'`)).rows[0];
    }
    const connectors = columns.get("workspace_messaging_connectors");
    if (connectors?.has("status")) output.messagingConnectors = (await client.query(`select status,count(*)::int connectors from public.workspace_messaging_connectors group by status order by status`)).rows;
    await client.query("rollback");
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined); throw error;
  } finally { await client.end(); }
}

void main();
