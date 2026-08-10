insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-video-assets',
  'marketing-video-assets',
  false,
  8388608,
  array['video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
