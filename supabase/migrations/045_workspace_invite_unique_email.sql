with ranked as (
  select
    id,
    row_number() over (
      partition by tenant_id, email
      order by
        case status when 'pending' then 1 when 'accepted' then 2 else 3 end,
        updated_at desc nulls last,
        created_at desc
    ) as row_number
  from public.workspace_invites
)
delete from public.workspace_invites wi
using ranked r
where wi.id = r.id
  and r.row_number > 1;

create unique index if not exists workspace_invites_tenant_email_key
on public.workspace_invites(tenant_id, email);
