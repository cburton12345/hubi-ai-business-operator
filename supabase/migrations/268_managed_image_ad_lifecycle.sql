alter table public.marketing_graphic_jobs drop constraint if exists marketing_graphic_jobs_status_check;
alter table public.marketing_graphic_jobs add constraint marketing_graphic_jobs_status_check check (status in ('draft','needs_review','approved','processing','generated','exported','failed','unknown','cancelled','archived'));
alter table public.marketing_graphic_jobs
  add column if not exists output_media_asset_id uuid references public.marketing_media_assets(id) on delete set null,
  add column if not exists provider_response_json jsonb not null default '{}'::jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;
alter table public.marketing_graphic_jobs
  add column if not exists approval_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists approval_hash text,
  add column if not exists approval_version uuid,
  add column if not exists approved_by_actor_key text,
  add column if not exists approved_at timestamptz;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('marketing-media-assets','marketing-media-assets',false,20971520,array['image/png'])
on conflict (id) do nothing;
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='marketing-media-assets' and name='marketing-media-assets' and public=false
      and file_size_limit=20971520 and allowed_mime_types=array['image/png']::text[]
  ) then
    raise exception 'Existing marketing-media-assets bucket is incompatible with managed image storage';
  end if;
end $$;
comment on column public.marketing_graphic_jobs.provider_response_json is 'Sanitized provider lifecycle evidence only; never store credentials or raw secret-bearing responses.';

create or replace function public.protect_marketing_graphic_approval()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.job_type = 'image_ad' and new.brand_id is not null
     and not exists (select 1 from public.brands where id=new.brand_id and tenant_id=new.tenant_id) then
    raise exception 'Managed image brand must belong to the same tenant';
  end if;
  if tg_op = 'UPDATE'
     and (new.job_type = 'image_ad' or old.job_type = 'image_ad')
     and (new.prompt_json is distinct from old.prompt_json or new.brand_id is distinct from old.brand_id or new.job_type is distinct from old.job_type)
     and old.status in ('processing','generated','exported','unknown','cancelled','archived') then
    raise exception 'Managed image inputs are immutable after provider dispatch';
  end if;
  if (new.job_type = 'image_ad' or (tg_op = 'UPDATE' and old.job_type = 'image_ad'))
     and coalesce(auth.role()::text, '') = 'authenticated' then
    if tg_op = 'INSERT' and (
      new.status not in ('draft', 'needs_review') or new.provider_key is not null
      or new.output_media_asset_id is not null or new.output_assets_json <> '[]'::jsonb
      or new.provider_response_json <> '{}'::jsonb or new.approval_hash is not null
      or new.approval_version is not null
      or new.approval_snapshot_json <> '{}'::jsonb or new.approved_by_actor_key is not null
      or new.approved_at is not null or new.submitted_at is not null or new.completed_at is not null
      or new.cancelled_at is not null or new.error_message is not null
      or new.metadata_json <> '{}'::jsonb
    ) then
      raise exception 'Managed image lifecycle fields are server controlled';
    elsif tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
      or new.job_type is distinct from old.job_type or new.status is distinct from old.status
      or new.provider_key is distinct from old.provider_key
      or new.output_media_asset_id is distinct from old.output_media_asset_id
      or new.output_assets_json is distinct from old.output_assets_json
      or new.provider_response_json is distinct from old.provider_response_json
      or new.approval_hash is distinct from old.approval_hash
      or new.approval_version is distinct from old.approval_version
      or new.approval_snapshot_json is distinct from old.approval_snapshot_json
      or new.approved_by_actor_key is distinct from old.approved_by_actor_key
      or new.approved_at is distinct from old.approved_at
      or new.submitted_at is distinct from old.submitted_at
      or new.completed_at is distinct from old.completed_at
      or new.cancelled_at is distinct from old.cancelled_at
      or new.error_message is distinct from old.error_message
      or new.metadata_json is distinct from old.metadata_json
    ) then
      raise exception 'Managed image lifecycle fields are server controlled';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.prompt_json is distinct from old.prompt_json or new.brand_id is distinct from old.brand_id or new.job_type is distinct from old.job_type)
     and old.approval_hash is not null then
    new.status := 'needs_review';
    new.approval_hash := null;
    new.approval_version := null;
    new.approval_snapshot_json := '{}'::jsonb;
    new.approved_by_actor_key := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_marketing_graphic_approval_trigger on public.marketing_graphic_jobs;
create trigger protect_marketing_graphic_approval_trigger before insert or update on public.marketing_graphic_jobs
for each row execute function public.protect_marketing_graphic_approval();

create or replace function public.protect_managed_image_job_delete()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role()::text, '') = 'authenticated' and old.job_type = 'image_ad' then
    raise exception 'Managed image jobs and their lifecycle evidence cannot be deleted directly';
  end if;
  return old;
end;
$$;
drop trigger if exists protect_managed_image_job_delete_trigger on public.marketing_graphic_jobs;
create trigger protect_managed_image_job_delete_trigger before delete on public.marketing_graphic_jobs
for each row execute function public.protect_managed_image_job_delete();

create or replace function public.protect_managed_image_asset_location()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role()::text, '') = 'authenticated'
     and (new.metadata_json->>'source' = 'managed_image_ad' or (tg_op = 'UPDATE' and old.metadata_json->>'source' = 'managed_image_ad')) then
    if tg_op = 'INSERT' or new.tenant_id is distinct from old.tenant_id
       or new.id is distinct from old.id or new.brand_id is distinct from old.brand_id
       or new.asset_type is distinct from old.asset_type
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.external_url is distinct from old.external_url
       or new.approved_for_ai_reuse is distinct from old.approved_for_ai_reuse
       or new.permission_status is distinct from old.permission_status
       or new.status is distinct from old.status or new.metadata_json is distinct from old.metadata_json then
      raise exception 'Managed image output coordinates are server controlled';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_managed_image_asset_location_trigger on public.marketing_media_assets;
create trigger protect_managed_image_asset_location_trigger before insert or update on public.marketing_media_assets
for each row execute function public.protect_managed_image_asset_location();

create or replace function public.protect_managed_image_asset_delete()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role()::text, '') = 'authenticated' and old.metadata_json->>'source' = 'managed_image_ad' then
    raise exception 'Managed image assets and their reconciliation evidence cannot be deleted directly';
  end if;
  return old;
end;
$$;
drop trigger if exists protect_managed_image_asset_delete_trigger on public.marketing_media_assets;
create trigger protect_managed_image_asset_delete_trigger before delete on public.marketing_media_assets
for each row execute function public.protect_managed_image_asset_delete();
