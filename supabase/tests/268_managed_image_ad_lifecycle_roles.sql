-- Isolated local Supabase role/trigger test. Never point this script at production.
-- Run only after migration 268 is applied to the approved disposable test stack.
begin;

insert into public.users(id,auth_user_id,email,name)
values
 ('26800000-0000-4000-8000-000000000001','26800000-0000-4000-8000-000000000101','migration-268-owner@example.invalid','Migration 268 owner'),
 ('26800000-0000-4000-8000-000000000031','26800000-0000-4000-8000-000000000131','migration-268-admin@example.invalid','Migration 268 admin'),
 ('26800000-0000-4000-8000-000000000032','26800000-0000-4000-8000-000000000132','migration-268-operator@example.invalid','Migration 268 operator'),
 ('26800000-0000-4000-8000-000000000033','26800000-0000-4000-8000-000000000133','migration-268-foreign@example.invalid','Migration 268 foreign owner');
insert into public.tenants(id,name,slug)
values
 ('26800000-0000-4000-8000-000000000002','Migration 268 test','migration-268-test'),
 ('26800000-0000-4000-8000-000000000102','Migration 268 foreign','migration-268-foreign');
insert into public.tenant_users(tenant_id,user_id,role,status)
values
 ('26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000001','owner','active'),
 ('26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000031','admin','active'),
 ('26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000032','operator','active'),
 ('26800000-0000-4000-8000-000000000102','26800000-0000-4000-8000-000000000033','owner','active');
insert into public.brands(id,tenant_id,name,slug)
values
 ('26800000-0000-4000-8000-000000000041','26800000-0000-4000-8000-000000000002','Same tenant brand','same-tenant-brand'),
 ('26800000-0000-4000-8000-000000000042','26800000-0000-4000-8000-000000000102','Foreign tenant brand','foreign-tenant-brand');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"26800000-0000-4000-8000-000000000101","role":"authenticated"}',true);

-- Legitimate draft input remains writable.
insert into public.marketing_graphic_jobs(id,tenant_id,job_type,status,prompt_json)
values ('26800000-0000-4000-8000-000000000003','26800000-0000-4000-8000-000000000002','image_ad','draft','{"prompt":"Initial safe draft"}'::jsonb);
update public.marketing_graphic_jobs set prompt_json='{"prompt":"Edited safe draft"}'::jsonb
where id='26800000-0000-4000-8000-000000000003';

-- Admin and operator retain positive same-tenant draft controls.
select set_config('request.jwt.claims','{"sub":"26800000-0000-4000-8000-000000000131","role":"authenticated"}',true);
insert into public.marketing_graphic_jobs(id,tenant_id,brand_id,job_type,status,prompt_json)
values ('26800000-0000-4000-8000-000000000021','26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000041','image_ad','draft','{"prompt":"Admin draft"}'::jsonb);
select set_config('request.jwt.claims','{"sub":"26800000-0000-4000-8000-000000000132","role":"authenticated"}',true);
insert into public.marketing_graphic_jobs(id,tenant_id,brand_id,job_type,status,prompt_json)
values ('26800000-0000-4000-8000-000000000022','26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000041','image_ad','draft','{"prompt":"Operator draft"}'::jsonb);
update public.marketing_graphic_jobs set prompt_json='{"prompt":"Operator edited draft"}'::jsonb where id='26800000-0000-4000-8000-000000000022';
select set_config('request.jwt.claims','{"sub":"26800000-0000-4000-8000-000000000101","role":"authenticated"}',true);

-- Unrelated graphic jobs and media keep their existing CRUD behavior.
insert into public.marketing_graphic_jobs(id,tenant_id,job_type,status,provider_key,metadata_json)
values ('26800000-0000-4000-8000-000000000023','26800000-0000-4000-8000-000000000002','review_graphic','approved','existing-provider','{"unrelated":true}'::jsonb);
update public.marketing_graphic_jobs set metadata_json='{"unrelated":"updated"}'::jsonb where id='26800000-0000-4000-8000-000000000023';
delete from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000023';
insert into public.marketing_media_assets(id,tenant_id,asset_type,title,storage_path,metadata_json)
values ('26800000-0000-4000-8000-000000000024','26800000-0000-4000-8000-000000000002','photo','unrelated','user-content/unrelated.png','{"source":"user_upload"}'::jsonb);
update public.marketing_media_assets set storage_path='user-content/unrelated-updated.png' where id='26800000-0000-4000-8000-000000000024';
delete from public.marketing_media_assets where id='26800000-0000-4000-8000-000000000024';

do $$
begin
  begin
    insert into public.marketing_graphic_jobs(id,tenant_id,brand_id,job_type,status)
    values ('26800000-0000-4000-8000-000000000025','26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000042','image_ad','draft');
    raise exception 'cross-tenant image brand INSERT unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant image brand INSERT unexpectedly succeeded' then raise; end if;
  end;
  begin
    insert into public.marketing_graphic_jobs(id,tenant_id,job_type,status)
    values ('26800000-0000-4000-8000-000000000026','26800000-0000-4000-8000-000000000102','image_ad','draft');
    raise exception 'foreign-tenant image INSERT unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'foreign-tenant image INSERT unexpectedly succeeded' then raise; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claims','',true);

-- Approval must compare-and-swap the exact prompt and brand read before review.
-- Simulate: server reads R1, an owner edits to R2, then the stale R1 approval arrives.
insert into public.marketing_graphic_jobs(id,tenant_id,job_type,status,prompt_json)
values ('26800000-0000-4000-8000-000000000027','26800000-0000-4000-8000-000000000002','image_ad','needs_review','{"prompt":"Approval revision R1"}'::jsonb);
create temporary table managed_image_stale_approval_input(prompt_json jsonb not null, brand_id uuid) on commit drop;
insert into managed_image_stale_approval_input(prompt_json,brand_id)
select prompt_json,brand_id from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000027';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"26800000-0000-4000-8000-000000000101","role":"authenticated"}',true);
update public.marketing_graphic_jobs set prompt_json='{"prompt":"Approval revision R2"}'::jsonb
where id='26800000-0000-4000-8000-000000000027';
reset role;
select set_config('request.jwt.claims','',true);
do $$
declare stale_input record; affected integer; observed record;
begin
  select prompt_json,brand_id into stale_input from managed_image_stale_approval_input;
  update public.marketing_graphic_jobs
  set status='approved',approval_hash='stale-r1',approval_version=gen_random_uuid(),
      approval_snapshot_json='{"prompt":"Approval revision R1"}'::jsonb,
      approved_by_actor_key='owner-actor',approved_at=now()
  where id='26800000-0000-4000-8000-000000000027' and status='needs_review'
    and prompt_json=stale_input.prompt_json and brand_id is not distinct from stale_input.brand_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'stale approval revision unexpectedly succeeded'; end if;
  select status,prompt_json,approval_hash into observed from public.marketing_graphic_jobs
  where id='26800000-0000-4000-8000-000000000027';
  if observed.status <> 'needs_review'
     or observed.prompt_json <> '{"prompt":"Approval revision R2"}'::jsonb
     or observed.approval_hash is not null then
    raise exception 'stale approval attempt changed the interleaved draft';
  end if;
end $$;

-- Brand eligibility is linearized into approval and paid-dispatch claim.
insert into public.brands(id,tenant_id,name,slug,status) values
 ('26800000-0000-4000-8000-000000000044','26800000-0000-4000-8000-000000000002','Approval archived brand','approval-archived-brand','archived'),
 ('26800000-0000-4000-8000-000000000045','26800000-0000-4000-8000-000000000002','Claim brand','claim-brand','active'),
 ('26800000-0000-4000-8000-000000000046','26800000-0000-4000-8000-000000000002','Active positive brand','active-positive-brand','active');
insert into public.marketing_graphic_jobs(id,tenant_id,brand_id,job_type,status,prompt_json) values
 ('26800000-0000-4000-8000-000000000028','26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000044','image_ad','needs_review','{"prompt":"Archived before approval"}'::jsonb),
 ('26800000-0000-4000-8000-000000000029','26800000-0000-4000-8000-000000000002',null,'image_ad','needs_review','{"prompt":"Null brand positive"}'::jsonb),
 ('26800000-0000-4000-8000-000000000030','26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000045','image_ad','needs_review','{"prompt":"Archive before claim"}'::jsonb),
 ('26800000-0000-4000-8000-000000000034','26800000-0000-4000-8000-000000000002','26800000-0000-4000-8000-000000000046','image_ad','needs_review','{"prompt":"Active brand positive"}'::jsonb);
do $$
declare affected integer;
begin
  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id='26800000-0000-4000-8000-000000000044' and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='approved',approval_hash='archived',approval_version=gen_random_uuid(),
      approval_snapshot_json='{"brand":"archived"}'::jsonb,approved_by_actor_key='owner-actor',approved_at=now()
    where id='26800000-0000-4000-8000-000000000028'
      and brand_id is not distinct from '26800000-0000-4000-8000-000000000044'::uuid
      and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'archived brand approval unexpectedly succeeded'; end if;

  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id=null::uuid and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='approved',approval_hash='null-brand',approval_version='26800000-0000-4000-8000-000000000053',
      approval_snapshot_json='{"brand":null}'::jsonb,approved_by_actor_key='owner-actor',approved_at=now()
    where id='26800000-0000-4000-8000-000000000029' and brand_id is null
      and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'null-brand approval did not succeed'; end if;

  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id='26800000-0000-4000-8000-000000000045' and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='approved',approval_hash='claim-brand',approval_version='26800000-0000-4000-8000-000000000054',
      approval_snapshot_json='{"brand":"claim"}'::jsonb,approved_by_actor_key='owner-actor',approved_at=now()
    where id='26800000-0000-4000-8000-000000000030'
      and brand_id is not distinct from '26800000-0000-4000-8000-000000000045'::uuid
      and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'active brand approval did not succeed'; end if;
  update public.brands set status='archived' where id='26800000-0000-4000-8000-000000000045';
  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id='26800000-0000-4000-8000-000000000045' and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='processing'
    where id='26800000-0000-4000-8000-000000000030' and status='approved'
      and approval_hash='claim-brand' and approval_version='26800000-0000-4000-8000-000000000054'
      and brand_id is not distinct from '26800000-0000-4000-8000-000000000045'::uuid
      and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'archived-between-approval-and-claim job unexpectedly dispatched'; end if;

  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id='26800000-0000-4000-8000-000000000046' and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='approved',approval_hash='active-brand',approval_version='26800000-0000-4000-8000-000000000055',
      approval_snapshot_json='{"brand":"active"}'::jsonb,approved_by_actor_key='owner-actor',approved_at=now()
    where id='26800000-0000-4000-8000-000000000034'
      and brand_id is not distinct from '26800000-0000-4000-8000-000000000046'::uuid
      and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id='26800000-0000-4000-8000-000000000046' and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='processing'
    where id='26800000-0000-4000-8000-000000000034' and status='approved'
      and approval_hash='active-brand' and approval_version='26800000-0000-4000-8000-000000000055'
      and brand_id is not distinct from '26800000-0000-4000-8000-000000000046'::uuid
      and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'active-brand dispatch claim did not succeed'; end if;

  with eligible_brand as materialized (
    select id from public.brands where tenant_id='26800000-0000-4000-8000-000000000002'
      and id=null::uuid and status<>'archived' for share
  ) update public.marketing_graphic_jobs set status='processing'
    where id='26800000-0000-4000-8000-000000000029' and status='approved'
      and approval_hash='null-brand' and approval_version='26800000-0000-4000-8000-000000000053'
      and brand_id is null and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id));
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'null-brand dispatch claim did not succeed'; end if;
end $$;

update public.marketing_graphic_jobs
set status='approved',approval_hash='server-bound',approval_version='26800000-0000-4000-8000-000000000051',approval_snapshot_json='{"server":true}'::jsonb,
    approved_by_actor_key='owner-actor',approved_at=now()
where id='26800000-0000-4000-8000-000000000003';

-- An H1 reader cannot claim after an edit and H2 reapproval.
do $$
declare affected integer;
begin
  update public.marketing_graphic_jobs set prompt_json='{"prompt":"Reapproved input"}'::jsonb
  where id='26800000-0000-4000-8000-000000000003';
  update public.marketing_graphic_jobs
  set status='approved',approval_hash='server-bound-h2',approval_version='26800000-0000-4000-8000-000000000052',
      approval_snapshot_json='{"server":"h2"}'::jsonb,approved_by_actor_key='owner-actor',approved_at=now()
  where id='26800000-0000-4000-8000-000000000003';
  update public.marketing_graphic_jobs set status='processing'
  where id='26800000-0000-4000-8000-000000000003' and status='approved'
    and approval_hash='server-bound' and approval_version='26800000-0000-4000-8000-000000000051';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'stale H1 approval claim unexpectedly succeeded'; end if;
  if not exists (
    select 1 from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000003'
      and status='approved' and approval_hash='server-bound-h2' and approval_version='26800000-0000-4000-8000-000000000052'
  ) then raise exception 'H2 approval identity changed after stale claim'; end if;
end $$;
insert into public.marketing_media_assets(id,tenant_id,asset_type,title,storage_bucket,storage_path,metadata_json)
values ('26800000-0000-4000-8000-000000000006','26800000-0000-4000-8000-000000000002','photo','server output','marketing-media-assets',
        '26800000-0000-4000-8000-000000000002/26800000-0000-4000-8000-000000000003/26800000-0000-4000-8000-000000000006.png',
        '{"source":"managed_image_ad","graphicJobId":"26800000-0000-4000-8000-000000000003"}'::jsonb);
insert into public.marketing_graphic_jobs(id,tenant_id,job_type,status,prompt_json,approval_hash,approval_version,approval_snapshot_json,approved_by_actor_key,approved_at,provider_response_json)
select id,'26800000-0000-4000-8000-000000000002','image_ad',status,'{"prompt":"Historical input"}'::jsonb,
       'historical',gen_random_uuid(),'{"server":true}'::jsonb,'owner-actor',now(),'{"retained":true}'::jsonb
from (values
  ('26800000-0000-4000-8000-000000000011'::uuid,'processing'::text),
  ('26800000-0000-4000-8000-000000000012'::uuid,'generated'::text),
  ('26800000-0000-4000-8000-000000000013'::uuid,'exported'::text),
  ('26800000-0000-4000-8000-000000000014'::uuid,'unknown'::text),
  ('26800000-0000-4000-8000-000000000015'::uuid,'cancelled'::text),
  ('26800000-0000-4000-8000-000000000016'::uuid,'archived'::text)
) as terminal_jobs(id,status);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"26800000-0000-4000-8000-000000000101","role":"authenticated"}',true);

-- Editing an approved input is allowed but must invalidate approval atomically.
update public.marketing_graphic_jobs set prompt_json='{"prompt":"Changed after approval"}'::jsonb
where id='26800000-0000-4000-8000-000000000003';
do $$
declare observed record;
begin
  select status,approval_hash,approved_by_actor_key into observed
  from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000003';
  if observed.status <> 'needs_review' or observed.approval_hash is not null or observed.approved_by_actor_key is not null then
    raise exception 'approved input edit did not invalidate approval';
  end if;
end $$;

do $$
declare terminal_job uuid;
begin
  begin
    insert into public.marketing_graphic_jobs(id,tenant_id,job_type,status,approval_hash,approval_snapshot_json,approved_by_actor_key,approved_at)
    values ('26800000-0000-4000-8000-000000000004','26800000-0000-4000-8000-000000000002','image_ad','approved','forged','{"forged":true}'::jsonb,'forged',now());
    raise exception 'forged approved INSERT unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'forged approved INSERT unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.marketing_graphic_jobs set status='generated',provider_key='forged',provider_response_json='{"forged":true}'::jsonb
    where id='26800000-0000-4000-8000-000000000003';
    raise exception 'forged lifecycle UPDATE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'forged lifecycle UPDATE unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.marketing_graphic_jobs set job_type='review_graphic'
    where id='26800000-0000-4000-8000-000000000003';
    raise exception 'image job-type escape unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'image job-type escape unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.marketing_graphic_jobs set metadata_json='{"forged":true}'::jsonb
    where id='26800000-0000-4000-8000-000000000003';
    raise exception 'image metadata escape unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'image metadata escape unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.marketing_graphic_jobs set brand_id='26800000-0000-4000-8000-000000000042'
    where id='26800000-0000-4000-8000-000000000003';
    raise exception 'cross-tenant image brand UPDATE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant image brand UPDATE unexpectedly succeeded' then raise; end if;
  end;
  begin
    insert into public.marketing_media_assets(id,tenant_id,asset_type,title,storage_bucket,storage_path,metadata_json)
    values ('26800000-0000-4000-8000-000000000005','26800000-0000-4000-8000-000000000002','photo','forged','marketing-media-assets','other/object.png','{"source":"managed_image_ad"}'::jsonb);
    raise exception 'forged managed asset INSERT unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'forged managed asset INSERT unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.marketing_media_assets set storage_path='other/object.png'
    where id='26800000-0000-4000-8000-000000000006';
    raise exception 'managed asset coordinate UPDATE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'managed asset coordinate UPDATE unexpectedly succeeded' then raise; end if;
  end;
  begin
    delete from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000003';
    raise exception 'managed image job DELETE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'managed image job DELETE unexpectedly succeeded' then raise; end if;
  end;
  begin
    delete from public.marketing_media_assets where id='26800000-0000-4000-8000-000000000006';
    raise exception 'managed image asset DELETE unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'managed image asset DELETE unexpectedly succeeded' then raise; end if;
  end;
  foreach terminal_job in array array[
    '26800000-0000-4000-8000-000000000011'::uuid,
    '26800000-0000-4000-8000-000000000012'::uuid,
    '26800000-0000-4000-8000-000000000013'::uuid,
    '26800000-0000-4000-8000-000000000014'::uuid,
    '26800000-0000-4000-8000-000000000015'::uuid,
    '26800000-0000-4000-8000-000000000016'::uuid
  ] loop
    begin
      update public.marketing_graphic_jobs set prompt_json='{"prompt":"Tampered historical input"}'::jsonb where id=terminal_job;
      raise exception 'post-dispatch input UPDATE unexpectedly succeeded';
    exception when others then
      if sqlerrm = 'post-dispatch input UPDATE unexpectedly succeeded' then raise; end if;
    end;
  end loop;
end $$;

-- A valid same-tenant pre-dispatch brand edit remains available.
do $$
begin
  if not exists (
    select 1 from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000003'
      and brand_id is null and job_type='image_ad' and metadata_json='{}'::jsonb and status='needs_review'
  ) then raise exception 'managed image row changed after rejected brand/job-type/metadata/lifecycle writes'; end if;
end $$;
update public.marketing_graphic_jobs set brand_id='26800000-0000-4000-8000-000000000041'
where id='26800000-0000-4000-8000-000000000003';

reset role;
select set_config('request.jwt.claims','',true);
do $$
begin
  if not exists (
    select 1 from public.marketing_graphic_jobs
    where id='26800000-0000-4000-8000-000000000003' and job_type='image_ad'
      and brand_id='26800000-0000-4000-8000-000000000041' and metadata_json='{}'::jsonb
  ) then raise exception 'managed image row changed after a rejected write'; end if;
  if (select count(*) from public.marketing_graphic_jobs where id in (
    '26800000-0000-4000-8000-000000000011','26800000-0000-4000-8000-000000000012',
    '26800000-0000-4000-8000-000000000013','26800000-0000-4000-8000-000000000014',
    '26800000-0000-4000-8000-000000000015','26800000-0000-4000-8000-000000000016'
  ) and prompt_json='{"prompt":"Historical input"}'::jsonb and provider_response_json='{"retained":true}'::jsonb) <> 6 then
    raise exception 'terminal image evidence changed after a rejected write';
  end if;
  if not exists (select 1 from public.marketing_media_assets where id='26800000-0000-4000-8000-000000000006') then
    raise exception 'managed image asset was deleted';
  end if;
  if exists (select 1 from public.marketing_graphic_jobs where id in ('26800000-0000-4000-8000-000000000025','26800000-0000-4000-8000-000000000026')) then
    raise exception 'foreign tenant or brand row was inserted';
  end if;
  if (select count(*) from public.marketing_graphic_jobs where id in ('26800000-0000-4000-8000-000000000021','26800000-0000-4000-8000-000000000022')) <> 2 then
    raise exception 'admin/operator same-tenant controls failed';
  end if;
  if exists (select 1 from public.marketing_graphic_jobs where id='26800000-0000-4000-8000-000000000023')
     or exists (select 1 from public.marketing_media_assets where id='26800000-0000-4000-8000-000000000024') then
    raise exception 'unrelated CRUD controls did not complete';
  end if;
end $$;
rollback;
