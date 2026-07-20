# Ducat2Plat — Build Specification

A dashboard that identifies the most efficient Prime junk to buy on warframe.market
(Plat-per-Ducat arbitrage) and tracks Baro Ki'Teer item ROI. This document is the
single source of truth: all architectural decisions have already been made and
justified — **build exactly what is written here, do not re-architect.**

---

## 1. What this is (and is not)

**Is:**
- A daily data pipeline: warframe.market closed-trade statistics → Supabase (Postgres).
- A Next.js dashboard ranking Prime junk by *actionable* Plat-per-Ducat and showing
  Baro visit history / countdown / shopping lists.
- A long-term archive: warframe.market only serves ~90 days of statistics; our own
  accumulated history is the durable asset of this project.

**Is NOT (explicit non-goals — do not build these):**
- ❌ No high-frequency order-book snapshotting. One daily sweep is the design.
- ❌ No "burst mode" or real-time reaction to Baro's arrival (he stays 48h; hours of
  latency are irrelevant).
- ❌ No ML price prediction. Ranking uses simple, transparent formulas defined in §6.
- ❌ No in-game automation of any kind (bannable). Read-only API + dashboard only.
- ❌ No trading bot / auto-whisper. The user trades manually.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Database | Supabase (Postgres), free tier | Service-role key used by the worker (unrestricted). **Deviation (2026-07-20):** also present as `SUPABASE_SERVICE_ROLE_KEY` in Vercel's server-only env, used exclusively by `/api/positions/*` route handlers (never sent to the client) to write the `positions` table for the M13 buy/close flow. All other reads go through the anon/publishable key + RLS read-only. |
| Ingestion worker | Node.js (TypeScript) script, no framework | Single entry point `worker/sweep.ts`. |
| Scheduler | GitHub Actions cron, once daily | With keepalive so the schedule never auto-disables (§7). |
| Frontend | Next.js (App Router), deployed on Vercel free tier | Reads Supabase directly via anon key. |
| Charts | Any lightweight lib (e.g. Recharts) | Price history + event markers. |

Repository layout:

```
/worker         TypeScript ingestion worker (runs in GHA)
/web            Next.js app
/supabase       SQL migrations (numbered files, applied in order)
SPEC.md         this file
```

---

## 3. External data sources

### 3.1 warframe.market API
- Base: `https://api.warframe.market/v1` (check if `/v2` is stable at build time; if
  yes prefer it, but v1 endpoints below are the contract to fulfill).
- **Rate limit: 3 requests/second.** Throttle the worker to **2.5 req/s** with a
  simple queue. On HTTP 429/503: exponential backoff (1s, 2s, 4s, give up after 5
  tries, record the item as failed, continue the sweep).
- Endpoints used:
  - `GET /items` — full item list (`id`, `url_name`, `item_name`). ~1 request.
  - `GET /items/{url_name}` — item detail incl. `ducats`, `tags`, `mod_max_rank`.
    **Ducat values never change** — fetch detail only for items not yet in our DB.
  - `GET /items/{url_name}/statistics` — closed-trade stats: `statistics_closed.90days`
    (daily rows: `volume`, `median`, `avg_price`, `min_price`, `max_price`, and
    `mod_rank` for mods). This is the analytical backbone.
  - `GET /items/{url_name}/orders` — live order book. Each order has `order_type`
    (buy/sell), `platinum`, `quantity`, `mod_rank`, and `user.status`
    (`ingame` / `online` / `offline`).

### 3.2 Baro Ki'Teer
- `GET https://api.warframestat.us/pc/voidTrader` — arrival, departure, relay, and
  (while active) `inventory[]` with `item`, `ducats`, `credits`.
- Baro cycle: arrives every 14 days, stays ~48 hours. The daily sweep naturally
  catches every visit at least once; that is sufficient.

### 3.3 Item universe
"Prime junk" = every item from `/items` whose detail has a non-null `ducats` value
(15 / 25 / 45 / 65 / 100). Also track Primed mods (Baro items) even though they have
no ducat value — they are the sell leg.

---

## 4. Database schema

Write as numbered SQL migrations in `/supabase`. Enable RLS on all tables with a
read-only `select` policy for `anon`; the worker uses the service-role key and
bypasses RLS.

```sql
create table prime_items (
  id uuid primary key default gen_random_uuid(),
  wfm_id text unique not null,
  url_name text unique not null,
  item_name text not null,
  ducats int,                          -- null for non-junk (e.g. Primed mods)
  is_primed_mod boolean not null default false,
  max_mod_rank int,                    -- null unless a mod
  tags text[],
  vaulted boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- Every ingestion run. Dashboard must ONLY read data belonging to the latest
-- sweep with completed_at IS NOT NULL (prevents torn/partial sweeps from
-- producing wrong rankings).
create table sweeps (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_total int,
  items_ok int,
  items_failed int,
  notes text
);

-- Daily closed-trade statistics. Idempotent upserts keyed on the PK, so
-- re-running a sweep for the same day is harmless.
create table trade_stats (
  item_id uuid not null references prime_items(id),
  stat_date date not null,
  mod_rank int not null default -1,    -- -1 = not a mod; ALWAYS segment mods by rank
  volume int,
  median numeric,
  avg_price numeric,
  min_price numeric,
  max_price numeric,
  sweep_id bigint references sweeps(id),
  primary key (item_id, stat_date, mod_rank)
);
create index trade_stats_item_date on trade_stats (item_id, stat_date desc);

-- Live sell-order depth, top candidates only, INGAME sellers only, retained 14 days.
create table order_snapshots (
  id bigint generated always as identity primary key,
  sweep_id bigint not null references sweeps(id),
  item_id uuid not null references prime_items(id),
  captured_at timestamptz not null default now(),
  price int not null,
  quantity int not null default 1,
  mod_rank int,
  seller_name text not null,
  seller_status text not null           -- store it, but worker only inserts 'ingame'
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
  item_id uuid references prime_items(id),   -- nullable: Baro sells non-market items
  item_name text not null,
  ducat_cost int not null,
  credit_cost int not null,
  primary key (visit_id, item_name)
);

-- Regime changes: price history across these events is NOT comparable.
-- Populated manually (seed from wiki) + optionally by a vault-status diff in sweeps.
create table vault_events (
  id bigint generated always as identity primary key,
  item_id uuid not null references prime_items(id),
  event text not null check (event in ('vaulted','unvaulted','resurgence')),
  effective_date date not null
);

-- Single-row liveness marker for the dashboard staleness banner.
create table heartbeat (
  id int primary key default 1 check (id = 1),
  last_sweep_id bigint,
  updated_at timestamptz not null default now()
);
```

**Size sanity check (do not "optimize" prematurely):** ~600 junk items × 1 stats
row/day ≈ 220k rows/year ≈ tens of MB. Order snapshots capped at 14 days. This fits
the free tier (~500MB) for years. No partitioning, no rollup tables needed at MVP.

---

## 5. Ingestion worker (`worker/sweep.ts`)

One command, idempotent, safe to re-run. Flow:

1. **Open sweep**: insert `sweeps` row, hold its id.
2. **Item catalog**: `GET /items`. Upsert names/`last_seen_at`. For url_names not in
   `prime_items`, fetch `GET /items/{url_name}` detail (rate-limited) and insert with
   `ducats`, `tags`, `max_mod_rank`, `is_primed_mod` (tag contains `primed` or name
   starts with "Primed "). This is expensive only on the very first run (~3k detail
   calls ≈ 20 min); afterwards only new items trigger detail calls.
3. **Statistics**: for every item with `ducats is not null` OR `is_primed_mod`:
   `GET .../statistics`, upsert **all available daily rows** from
   `statistics_closed.90days` into `trade_stats` (upserts are idempotent so
   overlap is harmless; upserting the full ~90-day window backfills any gaps and
   builds the long-term archive on every run). For mods, one row per `mod_rank`
   present. ~600–700 requests ≈ 5 min.
4. **Order depth for candidates**: compute preliminary PpD = `ducats / median` from
   the freshest `trade_stats` row; take the **top 60 items**. For each:
   `GET .../orders`, keep `order_type = 'sell'` AND `user.status = 'ingame'` only,
   insert the 20 cheapest into `order_snapshots`. ~60 requests.
5. **Baro**: fetch warframestat.us voidTrader. Upsert visit (keyed on `arrival`).
   If active and `inventory` non-empty, upsert `baro_visit_items`, matching
   `item_name` to `prime_items.item_name` case-insensitively (leave `item_id` null
   on no match — never drop the row).
6. **Close sweep**: set `completed_at`, `items_total/ok/failed`; upsert `heartbeat`.
7. **Retention**: `delete from order_snapshots where captured_at < now() - interval '14 days'`.

**Failure policy:** individual item failures are logged and skipped (sweep still
completes if ≥90% ok). If the process crashes, the sweep row simply never gets
`completed_at` and the dashboard keeps serving the previous complete sweep — this is
the designed behavior, not an error to "fix."

Config via env vars only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Never expose
the service key to `/web`.

---

## 6. Metrics (the actual product logic)

Ducat values are fixed game constants per item; all volatility is in the plat price.

1. **PpD (screening)** — `ducats / median_price` using the latest `trade_stats` row.
   Used only to pick the top-60 candidates in the sweep and as a table column.
2. **PpD@N (ranking — the headline metric)** — listings are asks, not fills, and
   buying N units walks up the book. From the latest complete sweep's
   `order_snapshots` for an item, order by price ascending, take rows until
   cumulative `quantity ≥ N`, sum the cost ⇒ `PpD@N = (ducats × N) / cost_N`.
   Default **N = 6** (one full trade's worth). If depth < N, flag the item
   "shallow" and rank it down.
3. **Velocity** — mean daily `volume` over the trailing 14 days of `trade_stats`.
   Final score: `score = PpD@N × min(1, velocity / 15)` (15 sales/day ≈ "liquid
   enough"; keep the constant configurable).
4. **Bundle view (trade-slot optimization)** — in-game trades are capped at the
   user's daily Mastery-Rank limit and 6 items per trade, so profit-per-trade beats
   profit-per-item. Group the latest `order_snapshots` by `seller_name`; surface
   sellers offering **≥2 candidate items**, with total ducats, total plat, and
   combined PpD for buying their whole basket. This view is the project's main
   differentiator — do not cut it.
5. **Baro ROI (per visit, while active)** — for each visit item matched to a
   Primed mod: `resale_median (rank 0!) − ducat_cost × junk_rate` where
   `junk_rate = 1 / (median PpD@6 of the top 20 ranked items with depth data)`,
   falling back to `0.10 p/ducat` when no depth data exists. The rate is
   computed live from the current sweep's order book, not hardcoded.
   Show `credit_cost` alongside. **Always compare rank-0 resale**
   — rank-10 prices embed Endo/credit investment and are a different market.
6. **Ducat shopping list** — user inputs current ducats + target; dashboard emits
   tonight's cheapest in-game path to the shortfall using PpD@N + bundles.

**Modeling caveats to encode, not ignore:**
- Median over mean everywhere (troll listings at 1p/9999p).
- Never mix `mod_rank`s in one series.
- Render `vault_events` and Baro visit windows as vertical markers on every price
  chart; do not fit or average across them (unvaultings are step changes).
- Junk prices seasonally rise into/during Baro visits; the buying window is the
  quiet week between visits. A simple "days until Baro" indicator next to the
  ranking is enough.
- Primed mod prices dip during/just after a visit (supply flood) and recover over
  weeks — the visit-history chart should make this visible; no forecasting needed.

---

## 7. Scheduling (GitHub Actions)

`.github/workflows/sweep.yml`:

- `schedule: cron '0 6 * * *'` (daily; exact hour irrelevant — GHA delays of even
  an hour are acceptable by design) + `workflow_dispatch` for manual runs.
- `concurrency: { group: sweep, cancel-in-progress: false }` — prevents overlap.
- Steps: checkout → setup Node → `npm ci` in `/worker` → run sweep with secrets →
  **keepalive**: use `gautamkrishnar/keepalive-workflow` (or a step that commits an
  empty heartbeat to an orphan branch) so the schedule survives >60 days without
  human commits.
- Job timeout 30 minutes. On failure the job fails visibly; no retry logic in GHA
  (the next day's sweep self-heals via the 7-day stats window).

---

## 8. Dashboard (`/web`)

Every page shows a **staleness banner** when `heartbeat.updated_at` is older than
36h ("Data is N hours old — pipeline may be down"). All queries read only from the
latest sweep with `completed_at is not null`.

Pages:
1. **`/` Junk Ranking** — table: item, ducats, median, PpD, **PpD@6**, velocity,
   score, depth flag; sorted by score. Expandable row → actual in-game sell orders
   (seller, price, qty) = a literal shopping list. Days-until-Baro widget.
2. **`/bundles`** — the seller-basket view from §6.4.
3. **`/baro`** — countdown; when active: inventory table with ducat/credit cost and
   ROI column; always: visit history per item ("last seen N visits ago") and a
   price chart per Primed mod with visit markers.
4. **`/item/[url_name]`** — full price/volume history from `trade_stats` with
   vault + Baro event markers.

Style: dark theme, dense tables, no landing-page fluff. It's a tool.

---

## 9. Build order (milestones with acceptance criteria)

Build strictly in this order; each milestone must pass its check before the next.

- **M1 — Schema + worker core.** Migrations apply cleanly to a fresh Supabase
  project; running the worker locally twice in a row completes two sweeps with no
  duplicate-key errors and populates `prime_items` + `trade_stats`.
  ✅ `select count(*) from trade_stats` grows; re-run causes no errors.
- **M2 — Candidates + orders + Baro + retention.** Steps 4–7 of §5 work.
  ✅ `order_snapshots` has only `ingame` sellers; `heartbeat` updates; when Baro is
  active a visit row + items exist.
- **M3 — GHA scheduling.** Workflow runs on schedule and via dispatch with secrets;
  keepalive present; concurrency group set.
  ✅ Two consecutive daily runs visible in Actions, both sweeps completed.
- **M4 — Ranking page.** `/` renders from the latest complete sweep with PpD@6,
  velocity, score, expandable order lists, staleness banner.
  ✅ Manually cross-check the top item against warframe.market's live listings.
- **M5 — Bundles + Baro pages.** §8.2 and §8.3.
- **M6 — Item detail charts + vault_events seed.** Seed the currently-vaulted list
  from the wiki (a one-off script or manual SQL is fine).

---

## 10. Pitfalls checklist (verify before calling any milestone done)

- [ ] Worker never exceeds ~2.5 req/s; 429s trigger backoff, not crashes.
- [ ] All writes are upserts; the whole sweep is re-runnable.
- [ ] Dashboard cannot read a torn sweep (only `completed_at is not null`).
- [ ] Service-role key exists only in GHA secrets, never in `/web` or client code.
- [ ] `mod_rank` is part of every stats key and every query touching mods.
- [ ] Offline/online (non-`ingame`) sellers excluded from anything "actionable."
- [ ] Ducat detail calls only for unseen items (first run is slow; later runs ~6 min).
- [ ] Retention delete runs inside the sweep; `order_snapshots` never exceeds ~14 days.
- [ ] Charts show event markers instead of smoothing across regime changes.

## 11. Domain constants (for reference)

- Ducat tiers: 15 / 25 / 45 / 65 / 100 per item, fixed.
- Trade tax is paid by each party **on what they receive**: prime parts ~2k credits
  (noise); receiving plat ~500 cr/plat (noise for us); Legendary items (Primed
  mods) ~1,000,000 cr — paid by the *buyer* of a Primed mod, so it's a demand
  dampener on our resale price, **not** a cost line in our ROI.
- Daily trade limit = Mastery Rank; max 6 items per trade side ⇒ hence PpD@6 and
  the bundle view.
- Baro: every 14 days, ~48h stay, inventory is DE-curated (not predictable —
  hence no forecasting, only recurrence history and decay visibility).
