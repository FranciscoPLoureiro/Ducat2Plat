-- Store the void-trader schedule from the API on the heartbeat row so the
-- countdown reads ground truth instead of deriving arrival + 14d (which the
-- off-cadence TennoCon visit skews).
alter table heartbeat
  add column if not exists baro_activation timestamptz,
  add column if not exists baro_expiry timestamptz,
  add column if not exists baro_active boolean;
