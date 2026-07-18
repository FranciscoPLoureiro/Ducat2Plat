-- Per-condition alert tracking: storing only the last condition lets
-- alternating conditions (restocked -> target_hit -> restocked) re-alert
-- forever. This array records every condition that has ever fired.
alter table positions
  add column alerted_conditions text[] not null default '{}';
