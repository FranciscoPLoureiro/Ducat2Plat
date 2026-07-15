-- 001_schema.sql: Initial database schema for Ducat2Plat

create table prime_items (
  id uuid primary key default gen_random_uuid(),
  wfm_id text unique not null,
  url_name text unique not null,
  item_name text not null,
  ducats int,
  is_primed_mod boolean not null default false,
  max_mod_rank int,
  tags text[],
  vaulted boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table sweeps (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_total int,
  items_ok int,
  items_failed int,
  notes text
);

create table trade_stats (
  item_id uuid not null references prime_items(id),
  stat_date date not null,
  mod_rank int not null default -1,
  volume int,
  median numeric,
  avg_price numeric,
  min_price numeric,
  max_price numeric,
  sweep_id bigint references sweeps(id),
  primary key (item_id, stat_date, mod_rank)
);
create index trade_stats_item_date on trade_stats (item_id, stat_date desc);

create table order_snapshots (
  id bigint generated always as identity primary key,
  sweep_id bigint not null references sweeps(id),
  item_id uuid not null references prime_items(id),
  captured_at timestamptz not null default now(),
  price int not null,
  quantity int not null default 1,
  mod_rank int,
  seller_name text not null,
  seller_status text not null
);
create index order_snap_item on order_snapshots (item_id, captured_at desc);
create index order_snap_sweep on order_snapshots (sweep_id);

create table baro_visits (
  id bigint generated always as identity primary key,
  arrival timestamptz not null unique,
  departure timestamptz not null,
  relay text
);

create table baro_visit_items (
  visit_id bigint not null references baro_visits(id),
  item_id uuid references prime_items(id),
  item_name text not null,
  ducat_cost int not null,
  credit_cost int not null,
  primary key (visit_id, item_name)
);

create table vault_events (
  id bigint generated always as identity primary key,
  item_id uuid not null references prime_items(id),
  event text not null check (event in ('vaulted','unvaulted','resurgence')),
  effective_date date not null
);

create table heartbeat (
  id int primary key default 1 check (id = 1),
  last_sweep_id bigint,
  updated_at timestamptz not null default now()
);

-- RLS: read-only select for anon on all tables
alter table prime_items enable row level security;
create policy "anon_read" on prime_items for select to anon using (true);

alter table sweeps enable row level security;
create policy "anon_read" on sweeps for select to anon using (true);

alter table trade_stats enable row level security;
create policy "anon_read" on trade_stats for select to anon using (true);

alter table order_snapshots enable row level security;
create policy "anon_read" on order_snapshots for select to anon using (true);

alter table baro_visits enable row level security;
create policy "anon_read" on baro_visits for select to anon using (true);

alter table baro_visit_items enable row level security;
create policy "anon_read" on baro_visit_items for select to anon using (true);

alter table vault_events enable row level security;
create policy "anon_read" on vault_events for select to anon using (true);

alter table heartbeat enable row level security;
create policy "anon_read" on heartbeat for select to anon using (true);
