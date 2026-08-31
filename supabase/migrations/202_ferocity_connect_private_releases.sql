insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ferocity-connect-releases',
  'ferocity-connect-releases',
  false,
  20971520,
  array['application/vnd.android.package-archive', 'application/octet-stream']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ferocity_connect_releases (
  id uuid primary key default gen_random_uuid(),
  version_name text not null,
  version_code integer not null check (version_code > 0),
  storage_bucket text not null default 'ferocity-connect-releases',
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[A-Fa-f0-9]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  minimum_supported_version_code integer not null default 1 check (minimum_supported_version_code > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  release_notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_code),
  unique (storage_bucket, storage_path)
);

create index if not exists ferocity_connect_releases_published_idx
  on public.ferocity_connect_releases (status, version_code desc)
  where status = 'published';

alter table public.ferocity_connect_releases enable row level security;
revoke all on public.ferocity_connect_releases from anon, authenticated;

