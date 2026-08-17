import { queryPostgres } from "@/lib/db/postgres";

export async function applyPlanEntitlements(input: {
  tenantId: string;
  planKey: string;
  billingStatus: string;
}) {
  await queryPostgres(
    `update public.tenants
        set plan_key=$2,billing_status=$3,updated_at=now()
      where id=$1`,
    [input.tenantId, input.planKey, input.billingStatus]
  );
  await queryPostgres(
    `update public.workspace_feature_entitlements e
        set status='disabled',
            metadata_json=e.metadata_json || jsonb_build_object('disabledByPlanChange',true,'changedToPlan',$2::text),
            updated_at=now()
      where e.tenant_id=$1
        and e.metadata_json ? 'provisionedFromPlan'
        and ($3 = 'cancelled' or not exists (
          select 1 from public.plan_feature_matrix m
           where m.plan_key=$2 and m.feature_key=e.feature_key and m.included=true
        ))`,
    [input.tenantId, input.planKey, input.billingStatus]
  );
  if (input.billingStatus === "cancelled") return;
  await queryPostgres(
    `insert into public.workspace_feature_entitlements (
       tenant_id,feature_key,status,usage_limit,usage_period,metadata_json,updated_at
     )
     select $1,feature_key,'enabled',null,'monthly',
            metadata_json || jsonb_build_object('provisionedFromPlan',$2::text),now()
       from public.plan_feature_matrix
      where plan_key=$2 and included=true
     on conflict (tenant_id,feature_key) do update
     set status='enabled',
         metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
         updated_at=now()`,
    [input.tenantId, input.planKey]
  );
}
