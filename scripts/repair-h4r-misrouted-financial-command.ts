import pg from "pg";

const apply = process.argv.includes("--apply");
const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const ownerEmail = "burtonchristopher125@gmail.com";
const campaignId = "94c192d2-ca99-4e4a-a3ff-e3b558175ee6";
const taskIds = [
  "d74e2419-bee8-47ab-b6fd-14c6f6a8b7b3",
  "a873a79f-5a04-4a44-8ed7-d6f8ff7d4a95",
];
const commandRunPrefixes = ["e084fb29", "ee2ff610"];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = new pg.Client({
    connectionString: required("DATABASE_URL"),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const owner = await client.query(`
      select 1 from public.users u
      join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id
      where lower(u.email)=lower($2) and tu.status='active'
        and tu.role in ('owner','admin') and t.slug='h4r' and t.status='active'`,
      [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected H4R owner/workspace mapping was not found.");

    const campaign = await client.query<{ status: string }>(`
      select status from public.content_studio_campaigns where tenant_id=$1 and id=$2`,
      [tenantId, campaignId]);
    if (campaign.rowCount !== 1) throw new Error("Expected misrouted campaign was not found.");

    const outputs = await client.query<{ status: string }>(`
      select status from public.content_studio_outputs where tenant_id=$1 and campaign_id=$2`,
      [tenantId, campaignId]);
    const drafts = await client.query<{ status: string }>(`
      select status from public.ai_drafts where tenant_id=$1 and metadata_json->>'campaignId'=$2`,
      [tenantId, campaignId]);
    const calendar = await client.query<{ status: string }>(`
      select status from public.marketing_calendar_items where tenant_id=$1 and metadata_json->>'campaignId'=$2`,
      [tenantId, campaignId]);
    const exports = await client.query<{ status: string }>(`
      select status from public.review_first_export_queue where tenant_id=$1 and metadata_json->>'campaignId'=$2`,
      [tenantId, campaignId]);
    const tasks = await client.query<{ id: string; status: string }>(`
      select id,status from public.personal_ops_items where tenant_id=$1 and id=any($2::uuid[])`,
      [tenantId, taskIds]);
    const commandRuns = await client.query<{ id: string; status: string }>(`
      select id,status from public.ai_command_runs
      where tenant_id=$1 and (${commandRunPrefixes.map((_, index) => `id::text like $${index + 2}`).join(" or ")})`,
      [tenantId, ...commandRunPrefixes.map((prefix) => `${prefix}%`)]);

    if (outputs.rowCount !== 10 || drafts.rowCount !== 10 || calendar.rowCount !== 9 || exports.rowCount !== 10) {
      throw new Error(`Misrouted campaign child-record counts changed; refusing automatic repair. outputs=${outputs.rowCount}, drafts=${drafts.rowCount}, calendar=${calendar.rowCount}, exports=${exports.rowCount}`);
    }
    if (tasks.rowCount !== taskIds.length) throw new Error("Expected misrouted personal tasks were not found.");
    if (commandRuns.rowCount !== commandRunPrefixes.length) throw new Error("Expected misrouted command runs were not found unambiguously.");
    const commandRunIds = commandRuns.rows.map((row) => row.id);
    if (outputs.rows.some((row) => !["draft", "needs_review", "archived"].includes(row.status))
      || drafts.rows.some((row) => !["draft", "needs_review", "archived"].includes(row.status))
      || calendar.rows.some((row) => !["draft", "rejected"].includes(row.status))
      || exports.rows.some((row) => !["draft", "needs_review", "blocked", "archived"].includes(row.status))) {
      throw new Error("A misrouted record advanced beyond review; refusing automatic repair.");
    }

    const plan = {
      mode: apply ? "apply" : "dry_run",
      externalActionsFound: 0,
      campaign: { id: campaignId, currentStatus: campaign.rows[0].status },
      outputs: outputs.rowCount,
      drafts: drafts.rowCount,
      calendarItems: calendar.rowCount,
      exportQueueItems: exports.rowCount,
      tasks: tasks.rows,
    };
    if (!apply) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    await client.query("begin");
    try {
      const repairMetadata = JSON.stringify({
        invalidatedReason: "financial_request_misrouted_to_growth",
        invalidatedAt: new Date().toISOString(),
        repair: "repair-h4r-misrouted-financial-command",
      });
      await client.query(`update public.content_studio_campaigns
        set status='archived',metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and id=$2`, [tenantId, campaignId, repairMetadata]);
      await client.query(`update public.content_studio_outputs
        set status='archived',metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and campaign_id=$2 and status in ('draft','needs_review','archived')`, [tenantId, campaignId, repairMetadata]);
      await client.query(`update public.ai_drafts
        set status='archived',metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and metadata_json->>'campaignId'=$2 and status in ('draft','needs_review','archived')`, [tenantId, campaignId, repairMetadata]);
      await client.query(`update public.marketing_calendar_items
        set status='rejected',metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and metadata_json->>'campaignId'=$2 and status in ('draft','rejected')`, [tenantId, campaignId, repairMetadata]);
      await client.query(`update public.review_first_export_queue
        set status='archived',metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and metadata_json->>'campaignId'=$2 and status in ('draft','needs_review','blocked','archived')`, [tenantId, campaignId, repairMetadata]);
      await client.query(`update public.personal_ops_items
        set status='archived',owner_attention=false,metadata_json=metadata_json||$3::jsonb,updated_at=now()
        where tenant_id=$1 and id=any($2::uuid[]) and status in ('open','watching','archived')`, [tenantId, taskIds, repairMetadata]);
      await client.query(`update public.owner_command_events
        set status='archived',owner_attention=false,ai_handled=false,
            ai_summary='Invalidated: the financial request was routed to an unrelated workflow.',
            metadata_json=metadata_json||$4::jsonb,updated_at=now()
        where tenant_id=$1 and (
          metadata_json->>'personalOpsItemId'=$2::text
          or metadata_json->>'personalOpsItemId'=$3::text
        )`, [tenantId, taskIds[0], taskIds[1], repairMetadata]);
      await client.query(`update public.ai_command_runs
        set status='failed',metadata_json=metadata_json||$3::jsonb
        where tenant_id=$1 and id=any($2::uuid[])`, [tenantId, commandRunIds, repairMetadata]);
      await client.query(`insert into public.operator_timeline_events
        (tenant_id,event_family,event_type,title,body,metadata_json)
        values ($1,'system','ai_workforce_command','Misrouted financial command repaired',
          'Archived only the unrelated growth drafts and money tasks created by the affected financial requests. No content was sent or published.',
          $2::jsonb)`, [tenantId, JSON.stringify({ ...JSON.parse(repairMetadata), campaignId, taskIds, commandRunIds })]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const certification = await client.query<{
      active_campaigns: string; active_outputs: string; active_drafts: string;
      active_calendar: string; active_exports: string; active_tasks: string;
      invalidated_runs: string; active_owner_events: string;
    }>(`select
      (select count(*) from public.content_studio_campaigns where tenant_id=$1 and id=$2 and status<>'archived')::text active_campaigns,
      (select count(*) from public.content_studio_outputs where tenant_id=$1 and campaign_id=$2 and status<>'archived')::text active_outputs,
      (select count(*) from public.ai_drafts where tenant_id=$1 and metadata_json->>'campaignId'=($2::uuid)::text and status<>'archived')::text active_drafts,
      (select count(*) from public.marketing_calendar_items where tenant_id=$1 and metadata_json->>'campaignId'=($2::uuid)::text and status<>'rejected')::text active_calendar,
      (select count(*) from public.review_first_export_queue where tenant_id=$1 and metadata_json->>'campaignId'=($2::uuid)::text and status<>'archived')::text active_exports,
      (select count(*) from public.personal_ops_items where tenant_id=$1 and id=any($3::uuid[]) and status<>'archived')::text active_tasks,
      (select count(*) from public.ai_command_runs where tenant_id=$1 and id=any($4::uuid[]) and status='failed')::text invalidated_runs,
      (select count(*) from public.owner_command_events where tenant_id=$1
        and (metadata_json->>'personalOpsItemId'=(($3::uuid[])[1])::text or metadata_json->>'personalOpsItemId'=(($3::uuid[])[2])::text)
        and status<>'archived')::text active_owner_events`,
      [tenantId, campaignId, taskIds, commandRunIds]);
    console.log(JSON.stringify({ ...plan, certification: certification.rows[0] }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
