create table if not exists public.platform_public_content (
  content_key text primary key,
  enabled boolean not null default false,
  source_type text not null default 'direct_video'
    check (source_type in ('direct_video', 'youtube', 'vimeo')),
  media_url text,
  poster_url text,
  eyebrow text not null default 'Watch Ferocity work',
  headline text not null default 'See scattered work become a clear action plan.',
  body text not null default 'Ferocity watches what is waiting, prepares the work, and keeps you in control of what gets sent, posted, charged, or changed.',
  cta_label text not null default 'Open full demo',
  cta_href text not null default '/demo',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_public_content_versions (
  id uuid primary key default gen_random_uuid(),
  content_key text not null references public.platform_public_content(content_key) on delete cascade,
  snapshot_json jsonb not null,
  changed_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_public_content_versions_key_created
  on public.platform_public_content_versions(content_key, created_at desc);

alter table public.platform_public_content enable row level security;
alter table public.platform_public_content_versions enable row level security;

revoke all on public.platform_public_content from anon, authenticated;
revoke all on public.platform_public_content_versions from anon, authenticated;

insert into public.platform_public_content (content_key)
values ('featured_demo')
on conflict (content_key) do nothing;

comment on table public.platform_public_content is
  'Small, typed public-site content slots controlled only by Ferocity platform administrators. This is not a general-purpose HTML CMS.';
