-- M9.1: Precomputed rankings table + junk_rate on sweeps

create table rankings (
  sweep_id bigint not null references sweeps(id),
  item_id uuid not null references prime_items(id),
  rank int not null,
  ppd numeric not null,
  ppd_at_n numeric,
  velocity numeric not null,
  score numeric not null,
  shallow boolean not null default false,
  orders_json jsonb,
  primary key (sweep_id, item_id)
);

create index rankings_sweep_rank on rankings (sweep_id, rank);

alter table rankings enable row level security;
create policy "anon_read_rankings" on rankings for select to anon using (true);

alter table sweeps add column junk_rate numeric;
