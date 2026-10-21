import pg from "pg";
import { randomUUID } from "node:crypto";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  try {
    const workspace = await client.query<{ id: string }>(
      `select id from public.tenants where slug='ferocity-qa-demo' limit 1`,
    );
    const tenantId = workspace.rows[0]?.id;
    if (!tenantId) throw new Error("Ferocity QA Demo workspace was not found.");

    await client.query("begin");
    const marker = `goal-surface-certification-${randomUUID()}`;
    const goal = await client.query<{ id: string }>(
      `insert into public.operating_goals
         (tenant_id,goal_key,goal_type,title,desired_outcome,status,priority,authority_mode,
          plan_version,evaluation_version,plan_json,last_evaluation_summary)
       values ($1,$2,'runtime_certification','Temporary goal-surface certification',$2,
         'progressing','normal','prepare',1,1,$3::jsonb,'Ferocity is safely advancing the certification outcome.')
       returning id`,
      [tenantId, marker, JSON.stringify({ reasoningStatus: "proposed", steps: [] })],
    );
    const goalId = goal.rows[0]?.id;
    if (!goalId) throw new Error("Temporary goal could not be created.");
    await client.query(
      `insert into public.operating_goal_steps
         (tenant_id,goal_id,plan_version,step_key,sequence_number,action,title,status,
          completion_evidence_requirement,href)
       values ($1,$2,1,'review-safe-step',0,'request_information','Confirm the safe certification detail',
         'needs_owner','An owner-reviewed certification detail','/app/approvals')`,
      [tenantId, goalId],
    );

    const goals = await client.query<{
      id: string;
      steps_total: string;
      steps_completed: string;
      steps_active: string;
      steps_needs_owner: string;
      current_step_title: string | null;
      current_step_href: string | null;
    }>(
      `select goal.id,goal.title,goal.status,goal.priority,goal.authority_mode,
         goal.last_evaluation_summary,goal.next_evaluation_at,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version) as steps_total,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
             and step.status='completed') as steps_completed,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
             and step.status in ('planned','ready','in_progress','waiting','blocked')) as steps_active,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
             and step.status='needs_owner') as steps_needs_owner,
         current_step.title as current_step_title,current_step.href as current_step_href
         from public.operating_goals goal
         left join lateral (
           select step.title,step.href from public.operating_goal_steps step
            where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
              and step.status not in ('completed','canceled')
            order by step.sequence_number limit 1
         ) current_step on true
        where goal.tenant_id=$1 and goal.status in ('active','progressing','waiting','blocked','needs_owner','paused')
        order by case goal.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
                 goal.next_evaluation_at asc
        limit 5`,
      [tenantId],
    );

    const certifiedGoal = goals.rows.find((row) => row.id === goalId);
    if (!certifiedGoal) throw new Error("The goal surface did not return the temporary active goal.");
    if (certifiedGoal.steps_total !== "1" || certifiedGoal.steps_needs_owner !== "1") {
      throw new Error("The goal surface returned incorrect step progress counts.");
    }
    if (certifiedGoal.current_step_title !== "Confirm the safe certification detail" || certifiedGoal.current_step_href !== "/app/approvals") {
      throw new Error("The goal surface did not return the current exact artifact destination.");
    }
    for (const row of goals.rows) {
      for (const value of [row.steps_total, row.steps_completed, row.steps_active, row.steps_needs_owner]) {
        if (!Number.isFinite(Number(value))) throw new Error("Goal progress returned a non-numeric count.");
      }
      if (row.current_step_href && !row.current_step_href.startsWith("/app/")) {
        throw new Error("Goal progress returned an unsafe artifact destination.");
      }
    }
    await client.query("rollback");
    console.log(JSON.stringify({
      ok: true,
      workspace: "ferocity-qa-demo",
      goalVisible: true,
      progressCounts: "verified",
      artifactLink: "/app/approvals",
      cleanup: "transaction_rolled_back",
    }));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Goal surface certification failed.");
  process.exitCode = 1;
});
