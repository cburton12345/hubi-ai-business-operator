alter table public.service_estimates
  add column if not exists customer_display_mode text not null default 'grouped'
    check (customer_display_mode in ('simple', 'grouped', 'detailed')),
  add column if not exists customer_intro text,
  add column if not exists customer_scope_summary text,
  add column if not exists customer_exclusions text,
  add column if not exists customer_next_steps text,
  add column if not exists show_line_item_prices boolean not null default true,
  add column if not exists show_quantities boolean not null default true,
  add column if not exists show_material_details boolean not null default false,
  add column if not exists show_labor_details boolean not null default false,
  add column if not exists show_overhead_details boolean not null default false,
  add column if not exists show_profit_details boolean not null default false,
  add column if not exists estimated_crew_size numeric(8,2),
  add column if not exists estimated_tearout_hours numeric(10,2),
  add column if not exists estimated_install_hours numeric(10,2),
  add column if not exists estimated_duration_hours numeric(10,2),
  add column if not exists labor_rate_cents integer not null default 0,
  add column if not exists labor_notes text,
  add column if not exists market_price_low_cents integer,
  add column if not exists market_price_high_cents integer,
  add column if not exists market_price_source text,
  add column if not exists market_price_checked_at timestamptz,
  add column if not exists market_price_notes text;

alter table public.estimate_line_items
  add column if not exists line_item_type text not null default 'service'
    check (line_item_type in ('service', 'material', 'labor', 'equipment', 'delivery', 'disposal', 'permit', 'overhead', 'profit', 'contingency', 'tax', 'discount', 'other')),
  add column if not exists group_key text,
  add column if not exists customer_visible boolean not null default true,
  add column if not exists customer_label text,
  add column if not exists internal_cost_cents integer not null default 0,
  add column if not exists internal_notes text;

alter table public.material_takeoffs
  add column if not exists crew_size numeric(8,2),
  add column if not exists tearout_hours numeric(10,2),
  add column if not exists install_hours numeric(10,2),
  add column if not exists estimated_duration_hours numeric(10,2),
  add column if not exists labor_rate_cents integer not null default 0,
  add column if not exists market_price_low_cents integer,
  add column if not exists market_price_high_cents integer,
  add column if not exists market_price_source text,
  add column if not exists market_price_checked_at timestamptz,
  add column if not exists market_price_notes text;

create index if not exists estimate_line_items_customer_visible_idx
  on public.estimate_line_items (tenant_id, estimate_id, customer_visible, position);
