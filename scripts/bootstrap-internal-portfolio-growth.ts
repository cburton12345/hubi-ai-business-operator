import pg from "pg";
import { runAiGrowthDepartment } from "../src/lib/growth/ai-growth-department";

const { Client } = pg;
const apply = process.argv.includes("--apply");
const tenantSlug = process.env.INTERNAL_PORTFOLIO_SLUG ?? "internal-portfolio";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const tenantResult = await client.query<{
      id: string;
      name: string;
      account_type: string;
    }>(
      `select id,name,account_type from public.tenants where slug=$1 and status='active' limit 1`,
      [tenantSlug],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant || tenant.account_type !== "internal") {
      throw new Error(
        `Active internal workspace ${tenantSlug} was not found; refusing to alter another workspace.`,
      );
    }

    const brands = await client.query<{
      id: string;
      name: string;
      slug: string;
    }>(
      `select id,name,slug from public.brands where tenant_id=$1 and status='active' order by created_at`,
      [tenant.id],
    );

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            workspace: tenant.name,
            brands: brands.rows,
            changes: [
              "Create or refresh a guarded Marketing OS profile for every active internal brand",
              "Create one suggest-only, organic-first growth objective where none exists",
              "Run the AI Growth Department across the portfolio without publishing or ad spend",
            ],
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query("begin");

    await client.query(
      `
      insert into public.marketing_os_business_profiles (
        tenant_id,brand_id,company_name,website_url,primary_phone,primary_email,
        brand_voice,ideal_customers,source,status,last_refreshed_at,metadata_json
      )
      select
        b.tenant_id,b.id,b.name,b.domain,b.phone,b.email,
        coalesce(ms.tone_of_voice,'Clear, credible, useful, and specific'),
        coalesce(ms.target_customers,b.primary_goal),
        'ferocity','needs_review',now(),
        jsonb_build_object(
          'refreshedFrom','internal_portfolio_bootstrap',
          'brandIntelligenceVersion',1,
          'ownerConfirmationRequired',true
        )
      from public.brands b
      left join public.brand_marketing_settings ms
        on ms.tenant_id=b.tenant_id and ms.brand_id=b.id
      where b.tenant_id=$1 and b.status='active'
      on conflict do nothing
    `,
      [tenant.id],
    );

    await client.query(
      `
      update public.marketing_os_business_profiles p
      set
        company_name=b.name,
        website_url=coalesce(b.domain,p.website_url),
        primary_phone=coalesce(b.phone,p.primary_phone),
        primary_email=coalesce(b.email,p.primary_email),
        brand_voice=coalesce(ms.tone_of_voice,p.brand_voice,'Clear, credible, useful, and specific'),
        ideal_customers=coalesce(ms.target_customers,p.ideal_customers,b.primary_goal),
        metadata_json=p.metadata_json || jsonb_build_object(
          'refreshedFrom','internal_portfolio_bootstrap',
          'brandIntelligenceVersion',1
        ),
        last_refreshed_at=now(),
        updated_at=now()
      from public.brands b
      left join public.brand_marketing_settings ms
        on ms.tenant_id=b.tenant_id and ms.brand_id=b.id
      where p.tenant_id=$1 and p.brand_id=b.id and b.tenant_id=p.tenant_id
    `,
      [tenant.id],
    );

    await client.query(
      `
      insert into public.growth_objectives (
        tenant_id,brand_id,name,service_focus,time_horizon_days,channel_keys,
        autonomy_level,status,metadata_json
      )
      select
        b.tenant_id,b.id,'Establish evidence-led profitable growth',b.primary_goal,90,
        array[]::text[],'suggest','active',
        jsonb_build_object(
          'organicFirst',true,
          'paidSpendAuthorized',false,
          'targetsNeedOwnerConfirmation',true,
          'createdBy','internal_portfolio_bootstrap'
        )
      from public.brands b
      where b.tenant_id=$1 and b.status='active'
        and not exists (
          select 1 from public.growth_objectives objective
          where objective.tenant_id=b.tenant_id
            and objective.brand_id=b.id
            and objective.status in ('active','draft')
        )
    `,
      [tenant.id],
    );

    await client.query("commit");

    const growth = await runAiGrowthDepartment({
      tenantId: tenant.id,
      maxActions: Math.max(5, brands.rows.length * 5),
    });

    const readiness = await client.query<{
      name: string;
      profiles: number;
      objectives: number;
      recommendations: number;
    }>(
      `
      select b.name,
        (select count(*)::int from public.marketing_os_business_profiles p where p.brand_id=b.id and p.status<>'archived') profiles,
        (select count(*)::int from public.growth_objectives o where o.brand_id=b.id and o.status in ('active','draft')) objectives,
        (select count(*)::int from public.marketing_campaign_recommendations r where r.brand_id=b.id and r.status<>'archived') recommendations
      from public.brands b
      where b.tenant_id=$1 and b.status='active'
      order by b.created_at
    `,
      [tenant.id],
    );

    console.log(
      JSON.stringify(
        {
          mode: "applied",
          workspace: tenant.name,
          safeguards: {
            autonomy: "suggest",
            organicFirst: true,
            paidSpendAuthorized: false,
            publishingTriggered: false,
          },
          growth,
          brands: readiness.rows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
