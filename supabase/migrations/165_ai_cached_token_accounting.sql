alter table public.ai_usage_events
  add column if not exists cached_prompt_tokens integer not null default 0
  check (cached_prompt_tokens >= 0);

comment on column public.ai_usage_events.cached_prompt_tokens is
  'Provider-reported cached input tokens used for model-aware AI cost and prompt-cache measurement.';
