-- M13: Position tracker table
-- Stores user's Primed-mod purchases for sell-signal tracking.
-- junk_rate_at_buy and baseline_at_buy are snapshotted at purchase time so
-- cost basis never drifts when the live junk rate changes.

create table positions (
  id bigint generated always as identity primary key,
  item_id uuid not null references prime_items(id),
  qty int not null default 1,
  cost_ducats int not null,
  cost_credits int not null default 0,
  junk_rate_at_buy numeric not null,
  baseline_at_buy numeric not null,
  target_price numeric not null,
  acquired_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_price numeric,
  closed_at timestamptz,
  last_alert_condition text,
  last_alert_at timestamptz
);

create index positions_status on positions (status) where status = 'open';
create index positions_item on positions (item_id);

-- RLS: anon can read, only service-role can write
alter table positions enable row level security;
create policy "anon_read_positions" on positions
  for select to anon using (true);
