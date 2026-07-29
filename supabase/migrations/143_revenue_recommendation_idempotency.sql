-- Workspace-wide revenue scans do not have a brand_id. PostgreSQL treats NULL
-- values as distinct in a normal unique constraint, so repeated scans could
-- create duplicate recommendations. Keep the most recently meaningful row,
-- then enforce one workspace-level recommendation per key.

with ranked as (
  select
    id,
    row_number() over (
      partition by tenant_id, recommendation_key
      order by
        case status
          when 'approved' then 0
          when 'completed' then 1
          when 'snoozed' then 2
          when 'dismissed' then 3
          else 4
        end,
        updated_at desc,
        created_at desc,
        id
    ) as duplicate_rank
  from public.revenue_recommendations
  where brand_id is null
)
delete from public.revenue_recommendations
where id in (
  select id from ranked where duplicate_rank > 1
);

create unique index if not exists revenue_recommendations_workspace_key_unique
  on public.revenue_recommendations (tenant_id, recommendation_key)
  where brand_id is null;
