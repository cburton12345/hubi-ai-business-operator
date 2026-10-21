import { withPostgresTransactionResult } from "@/lib/db/postgres";
import { listServiceFeatureDefinitions, planAllowsFeature } from "@/lib/controls/service-gates";

export function inheritedServiceFeaturesForPlan(planKey: string) {
  return listServiceFeatureDefinitions()
    .filter((feature) => planAllowsFeature(planKey, feature.key))
    .map((feature) => feature.key);
}

export async function applyPlanEntitlements(input: {
  tenantId: string;
  planKey: string;
  billingStatus: string;
}) {
  const inheritedServiceFeatures = inheritedServiceFeaturesForPlan(input.planKey);
  const result = await withPostgresTransactionResult(async (client) => {
    await client.query(
    `update public.tenants
        set plan_key=$2,billing_status=$3,updated_at=now()
      where id=$1`,
    [input.tenantId, input.planKey, input.billingStatus]
    );
    await client.query(
    `update public.workspace_feature_entitlements e
        set status='disabled',
            metadata_json=e.metadata_json || jsonb_build_object('disabledByPlanChange',true,'changedToPlan',$2::text),
            updated_at=now()
      where e.tenant_id=$1
        and e.metadata_json ? 'provisionedFromPlan'
        and ($3 = 'cancelled' or (
          not exists (
            select 1 from public.plan_feature_matrix m
             where m.plan_key=$2 and m.feature_key=e.feature_key and m.included=true
          )
          and not (e.feature_key = any($4::text[]))
        ))`,
    [input.tenantId, input.planKey, input.billingStatus, inheritedServiceFeatures]
    );
    if (input.billingStatus === "cancelled") return;
    await client.query(
    `with selected_features as (
       select feature_key,metadata_json,0 as source_priority
         from public.plan_feature_matrix where plan_key=$2 and included=true
       union all
       select feature_key,'{}'::jsonb,1 from unnest($3::text[]) feature_key
     ), deduplicated as (
       select distinct on (feature_key) feature_key,metadata_json
         from selected_features order by feature_key,source_priority
     )
     insert into public.workspace_feature_entitlements (
       tenant_id,feature_key,status,usage_limit,usage_period,metadata_json,updated_at
     )
     select $1,feature_key,'enabled',null,'monthly',
            metadata_json || jsonb_build_object('provisionedFromPlan',$2::text,'inheritedServiceFeature',true),now()
       from deduplicated
     on conflict (tenant_id,feature_key) do update
     set status='enabled',
         metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
         updated_at=now()`,
    [input.tenantId, input.planKey, inheritedServiceFeatures]
    );
  });
  if (!result.ok) {
    throw new Error("Ferocity could not reconcile the subscription and workspace entitlements atomically.", {
      cause: result.error
    });
  }
}
