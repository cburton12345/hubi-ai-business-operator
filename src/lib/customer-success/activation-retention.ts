import "server-only";

import { queryPostgres } from "@/lib/db/postgres";
import { decideCustomerSuccessLifecycle } from "@/lib/customer-success/activation-retention-decision";

type SignalRow = {
  tenant_name: string;
  billing_status: string;
  onboarding_complete: boolean;
  days_since_signup: number;
  days_since_activity: number;
  business_profiles: number;
  connected_systems: number;
  ferocity_commands: number;
  operational_records: number;
};

export async function syncCustomerActivationRetentionForTenant(tenantId: string) {
  const result = await queryPostgres<SignalRow>(
    `
    select
      tenant.name as tenant_name,
      coalesce(subscription.status,tenant.billing_status,'none') as billing_status,
      tenant.onboarding_status = 'completed' as onboarding_complete,
      greatest(0,floor(extract(epoch from (now()-tenant.created_at))/86400))::int as days_since_signup,
      greatest(0,floor(extract(epoch from (now()-greatest(
        tenant.updated_at,
        coalesce((select max(updated_at) from public.ferocity_chat_threads where tenant_id=tenant.id),tenant.created_at),
        coalesce((select max(greatest(created_at,coalesce(completed_at,started_at))) from public.ai_agent_runs where tenant_id=tenant.id),tenant.created_at),
        coalesce((select max(updated_at) from public.leads where tenant_id=tenant.id),tenant.created_at),
        coalesce((select max(updated_at) from public.service_jobs where tenant_id=tenant.id),tenant.created_at),
        coalesce((select max(updated_at) from public.service_invoices where tenant_id=tenant.id),tenant.created_at)
      )))/86400))::int as days_since_activity,
      (select count(*)::int from public.brands brand where brand.tenant_id=tenant.id and brand.status='active' and nullif(brand.industry,'') is not null) as business_profiles,
      (select count(*)::int from public.integration_connections connection where connection.tenant_id=tenant.id and connection.status='connected') as connected_systems,
      ((select count(*) from public.ferocity_chat_messages message where message.tenant_id=tenant.id and message.role='owner')+
       (select count(*) from public.ai_agent_runs run where run.tenant_id=tenant.id))::int as ferocity_commands,
      ((select count(*) from public.leads lead where lead.tenant_id=tenant.id)+
       (select count(*) from public.customers customer where customer.tenant_id=tenant.id)+
       (select count(*) from public.service_jobs job where job.tenant_id=tenant.id)+
       (select count(*) from public.service_invoices invoice where invoice.tenant_id=tenant.id))::int as operational_records
    from public.tenants tenant
    left join public.billing_subscriptions subscription on subscription.tenant_id=tenant.id
    where tenant.id=$1 and tenant.status <> 'archived'
    limit 1
    `,
    [tenantId]
  );
  const row = result?.rows[0];
  if (!row) return { status: "not_found" as const };

  const decision = decideCustomerSuccessLifecycle({
    billingStatus: row.billing_status,
    onboardingComplete: row.onboarding_complete,
    daysSinceSignup: Number(row.days_since_signup),
    daysSinceActivity: Number(row.days_since_activity),
    hasBusinessProfile: Number(row.business_profiles) > 0,
    connectedSystems: Number(row.connected_systems),
    ferocityCommands: Number(row.ferocity_commands),
    operationalRecords: Number(row.operational_records)
  });
  const values = {
    businessProfile: Number(row.business_profiles) > 0,
    connectedSystems: Number(row.connected_systems),
    ferocityCommands: Number(row.ferocity_commands),
    operationalRecords: Number(row.operational_records)
  };

  await queryPostgres(
    `
    insert into public.customer_success_lifecycle_snapshots (
      tenant_id,snapshot_date,lifecycle_stage,activation_score,health_score,days_since_signup,
      days_since_activity,first_value_reached,value_signals_json,risk_reasons_json,next_best_action,metadata_json
    ) values ($1,current_date,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb)
    on conflict (tenant_id,snapshot_date) do update set
      lifecycle_stage=excluded.lifecycle_stage,activation_score=excluded.activation_score,health_score=excluded.health_score,
      days_since_signup=excluded.days_since_signup,days_since_activity=excluded.days_since_activity,
      first_value_reached=excluded.first_value_reached,value_signals_json=excluded.value_signals_json,
      risk_reasons_json=excluded.risk_reasons_json,next_best_action=excluded.next_best_action,
      metadata_json=public.customer_success_lifecycle_snapshots.metadata_json || excluded.metadata_json,updated_at=now()
    `,
    [tenantId,decision.stage,decision.activationScore,decision.healthScore,row.days_since_signup,row.days_since_activity,
      decision.firstValueReached,JSON.stringify(values),JSON.stringify(decision.riskReasons),decision.nextBestAction,
      JSON.stringify({ generatedBy: "customer_activation_retention_loop", evidenceVersion: 1 })]
  );

  if (decision.stage === "at_risk" || (decision.stage === "onboarding" && Number(row.days_since_signup) >= 1)) {
    const title = decision.stage === "at_risk" ? "Ferocity found the shortest path back to value" : "Let Ferocity produce the first useful result";
    const summary = decision.riskReasons.length
      ? `${decision.riskReasons.join(" ")} ${decision.nextBestAction}`
      : decision.nextBestAction;
    const command = encodeURIComponent(`Take the lead on activation and retention for this workspace. ${decision.nextBestAction} Handle every safe internal step, prepare protected actions for approval, and show me the result.`);
    await queryPostgres(
      `
      insert into public.owner_command_events (
        tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
        owner_attention,ai_handled,ai_summary,recommended_action,action_href,money_cents,risk_type,confidence_score,metadata_json
      ) values ($1,'ferocity','Ferocity',$2,'customer_success.lifecycle',$3,$4,$5,'needs_owner',true,true,$4,$6,$7,0,'revenue',90,$8::jsonb)
      on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do update set
        title=excluded.title,summary=excluded.summary,severity=excluded.severity,status=excluded.status,
        owner_attention=excluded.owner_attention,ai_handled=excluded.ai_handled,ai_summary=excluded.ai_summary,
        recommended_action=excluded.recommended_action,action_href=excluded.action_href,confidence_score=excluded.confidence_score,
        metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json,updated_at=now()
      `,
      [tenantId,`customer-success:${decision.stage}`,title,summary,decision.stage === "at_risk" ? "high" : "medium",
        decision.nextBestAction,`/app/ferocity?command=${command}`,JSON.stringify({ decision, values })]
    );
  }

  return { status: "ready" as const, ...decision };
}
