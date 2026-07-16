# Builder Prompts — Roadmap M7–M11

Copy-paste one prompt per session, in order. Each prompt is self-contained.
Before each milestone, complete its **"Your prep (human)"** checklist — these are
things only you can do (accounts, secrets, webhooks). After the builder finishes,
run the acceptance check from ROADMAP.md yourself before moving on.

---

## Your prep (human) — before M7

- [ ] Create a Vercel account/project connected to this repo (root dir: `web/`).
- [ ] Create a Discord server + channel → channel settings → Integrations →
      Webhooks → copy the webhook URL.
- [ ] GitHub repo → Settings → Secrets and variables → Actions → add:
      `DISCORD_WEBHOOK_URL` (from above) and `SUPABASE_DB_URL` (Supabase dashboard
      → Project Settings → Database → connection string, URI format, with password).
- [ ] Create a throwaway second Supabase project (for the restore test). Keep its
      connection string handy for the builder.

## Prompt — M7: Deploy & Operate

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M7 only** from ROADMAP.md — do not start M8+. Follow both documents
exactly; the non-goals in SPEC.md §1 and ROADMAP.md ("do not build") are hard
constraints — no re-architecting, no new services, no auth.

Repo context you need:
- `/web` is Next.js on Supabase (anon key, RLS read-only). `/worker` is the
  ingestion script run by `.github/workflows/sweep.yml` (daily cron + keepalive).
- `web/AGENTS.md` warns this Next.js version has breaking changes — read the
  relevant guides in `web/node_modules/next/dist/docs/` before touching config.
- Secrets already in GitHub Actions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  DISCORD_WEBHOOK_URL, SUPABASE_DB_URL.

Tasks (ROADMAP.md M7, restated with specifics):
1. Vercel deploy config for /web: ensure `next build` passes locally first; add
   any needed vercel.json only if defaults don't work (monorepo root is web/).
   Tell me exactly which env vars to set in the Vercel dashboard and for which
   environments (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY — never
   the service key).
2. Alerting in .github/workflows/sweep.yml:
   - A final step with `if: failure()` that POSTs a Discord embed to
     $DISCORD_WEBHOOK_URL: workflow name, run URL, which step failed.
   - After a successful sweep, the worker already writes items_ok/items_failed to
     the sweeps table; make the worker exit with a distinct code (e.g. 2) when
     items_failed/items_total > 0.1, and add a workflow step that catches that
     code and posts a "degraded sweep" Discord warning without failing the run.
3. New workflow .github/workflows/backup.yml: weekly cron + workflow_dispatch.
   Runs `pg_dump "$SUPABASE_DB_URL" | gzip` and uploads as an actions artifact
   (retention-days: 90, name includes the date). On failure, same Discord alert
   pattern. Note: use the Postgres client version matching Supabase (pg_dump 15+;
   install via apt in the job).
4. README.md: architecture overview (one mermaid diagram: API → worker/GHA →
   Supabase → Next.js/Vercel), the production URL placeholder for me to fill,
   and a Runbook section covering: "sweep failed" diagnosis steps, manual re-run
   via workflow_dispatch, backup restore procedure (psql < dump into a fresh
   project + re-point env vars), key rotation steps.

Do not commit or push without showing me the diff summary first. After each task,
state what changed and how you verified it. When done, walk me through the
Vercel dashboard steps and the restore test against my scratch Supabase project
(I'll run the commands; you provide them exactly).
```

---

## Your prep (human) — before M8

- [ ] Nothing — this milestone is fully local. Have `worker/.env` present if you
      want the builder to run a live sweep at the end (optional).

## Prompt — M8: Correctness Hardening

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M8 only** from ROADMAP.md. Hard constraints: SPEC.md §1 non-goals,
ROADMAP.md "do not build" list, and: do NOT change any metric's behavior — this
milestone extracts and tests existing math, it does not "improve" it. If you
believe a formula is wrong, tell me instead of changing it.

Repo context:
- Metric math currently lives inline in web/src/lib/data.ts (PpD@N order-book
  walk, velocity sum/14, computeJunkRate, Baro ROI, isSpecialVisit, fetchAll
  pagination helper). The worker (worker/sweep.ts) has untyped `any` parsing of
  warframe.market v1 and warframestat.us responses.
- Known past bugs your tests must specifically cover: (a) ROI once divided by
  the junk rate instead of multiplying; (b) queries silently truncated at
  PostgREST's 1000-row cap — fetchAll exists to fix this, test its page-boundary
  behavior (exactly 1000 rows, 1001, 0).
- web/AGENTS.md: read node_modules/next/dist/docs/ guides before touching config.

Tasks (ROADMAP.md M8, restated):
1. Extract pure functions to web/src/lib/metrics.ts exactly as listed in
   ROADMAP.md M8.1. data.ts imports them; zero behavior change (verify by
   comparing / and /baro page output before and after — same numbers).
2. Vitest setup in /web + unit tests per ROADMAP.md M8.2. Include fixtures for:
   order-book walk crossing a quantity boundary mid-order, shallow book (< 6
   units), empty orders, junk-rate fallback when no depth data, velocity with
   sparse days, ROI sign around zero, special-visit detection (relay regex and
   item-count threshold).
3. Zod schemas in a new worker/wfm-schemas.ts for: /items list, item detail,
   statistics payload, orders payload, and warframestat voidTrader. Parse with
   safeParse; on failure log item + first issue, count as failed, continue.
   Remove every `any` from worker/sweep.ts. Add minimal response fixtures
   (worker/fixtures/*.json, trimmed real responses) and vitest tests in /worker
   proving valid fixtures parse and a mutilated fixture is rejected.
4. Data-quality gate per ROADMAP.md M8.4, implemented in the worker just before
   closing the sweep; violations append to sweeps.notes and exit code 2 (the
   M7 workflow already turns exit 2 into a Discord warning).
5. CI workflow .github/workflows/ci.yml on pull_request and push to main:
   web (npm ci, eslint, tsc --noEmit, vitest run, next build) and worker
   (npm ci, tsc --noEmit, vitest run). Add the status badge to README.

After each task state what changed and how you verified it. Finish by running
the full CI suite locally and pasting the summary.
```

---

## Your prep (human) — before M9

- [ ] Decide nothing; but after the builder finishes, you must add one new secret:
      `REVALIDATE_TOKEN` (any long random string) in BOTH GitHub Actions secrets
      and Vercel env vars — the builder will tell you when.

## Prompt — M9: Performance & Cost

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M9 only** from ROADMAP.md. Hard constraints: SPEC.md §1 non-goals and
ROADMAP.md "do not build". M8 is complete: pure metric functions live in
web/src/lib/metrics.ts with tests — REUSE them, do not duplicate math.

Repo context:
- Data changes exactly once/day (worker sweep via GHA). Pages currently use
  force-dynamic and recompute rankings from raw rows per request; /baro
  additionally re-runs the entire ranking query inside computeJunkRate.
- PostgREST caps queries at 1000 rows — any new bulk read must use the existing
  fetchAll helper in web/src/lib/data.ts with a deterministic order.
- web/AGENTS.md: this Next.js version differs from your training data — read
  node_modules/next/dist/docs/ for the current ISR / revalidation API before
  implementing task 2.

Tasks (ROADMAP.md M9, restated):
1. Shared metrics + precomputed rankings:
   - Move metrics.ts to shared/metrics.ts, imported by both web (path alias) and
     worker. Keep the vitest tests running against the new location.
   - New migration: rankings table per ROADMAP.md M9.1 (orders_json jsonb for
     the expandable order list), plus junk_rate numeric column on sweeps.
   - Worker: after closing a sweep, compute the ranked list + junk rate using
     shared/metrics.ts and write rankings rows + sweeps.junk_rate.
   - Web: getRankedItems reads rankings for the latest completed sweep (single
     query, fetchAll); computeJunkRate reads sweeps.junk_rate. Page output must
     match the previous computation on the same sweep (spot-check top 10 rows).
2. Caching: replace force-dynamic with ISR revalidate = 3600 on all pages; add
   an on-demand revalidation route handler (POST, checks REVALIDATE_TOKEN)
   revalidating /, /bundles, /baro; the sweep workflow's last step calls it.
   Tell me when to add the REVALIDATE_TOKEN secret (GHA + Vercel) — do not
   invent placeholder values in committed files.
3. Retention per ROADMAP.md M9.3: worker deletes rankings older than the last
   30 sweeps and appends row-count telemetry to sweeps.notes.

Behavior guardrail: the staleness banner must still work when pages are cached —
compute staleness client-side from a timestamp embedded at build/revalidate time
plus heartbeat data, or fetch heartbeat in a tiny client component. Verify the
banner appears when heartbeat is stale even on a cached page.

After each task state what changed and how you verified it. Finish with: local
next build passing, worker run writing rankings, and the revalidate route
returning 401 without the token and 200 with it (test locally).
```

---

## Your prep (human) — before M10

- [ ] None required. Optional: have your Mastery Rank and typical ducat targets
      in mind — the builder may ask for sensible defaults.

## Prompt — M10: Product Completeness

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M10 only** from ROADMAP.md. Hard constraints: SPEC.md §1 non-goals
and ROADMAP.md "do not build". M7–M9 are complete: the site is deployed with
ISR + on-demand revalidation, rankings are precomputed by the worker, metrics
live in shared/metrics.ts with tests.

Repo context:
- web/AGENTS.md: read node_modules/next/dist/docs/ before using APIs you
  haven't verified in this Next.js version.
- PostgREST 1000-row cap: bulk reads use the fetchAll helper with deterministic
  order.
- vault_events table exists in the schema but is empty; chart components
  (mod-chart.tsx, item-detail-chart.tsx) already support vertical reference
  lines.

Tasks (ROADMAP.md M10, restated):
1. Vault seed: worker/scripts/seed-vault.ts producing a REVIEWABLE output first
   (print the proposed vault status list; insert only with --apply). Source the
   current vaulted/available list from a maintained public dataset (e.g. WFCD
   warframe-items on GitHub) rather than scraping the wiki. Wire vault markers
   into item detail and Primed-mod charts (amber = Baro visits, distinct color =
   vault events, with a tiny legend).
2. Ducat shopping-list planner on /: "ducats I have" + "ducats I need" inputs
   (localStorage persistence), output grouped by seller using existing
   PpD@6/bundle data: cheapest set of in-game listings covering the shortfall,
   each group with total plat, total ducats, and a copy-to-clipboard
   `/w SellerName Hi! WTB: <item list> for <total>p (warframe.market)` button.
   Pure client component over data already on the page — no new endpoints.
3. Rank-10 resale toggle on the Baro Primed-mods table: fetch mod_rank = max
   rank medians alongside rank 0 (respect the 1000-row cap; reuse the resale
   query pattern with a window); toggle switches the Resale column; ROI stays
   rank-0-based per SPEC — show a tooltip explaining why.
4. UX pass per ROADMAP.md M10.4: audit every page at 375px width (tables become
   horizontally scrollable in their own container, controls wrap); loading.tsx +
   error.tsx per route; per-page <title>; footer on all pages: "Data:
   warframe.market · Not affiliated with Digital Extremes"; worker requests set
   a User-Agent like "Ducat2Plat/1.0 (+repo URL)".

After each task state what changed and how you verified it — for UI tasks
include what you checked at mobile width. Do not run seed-vault with --apply;
show me the proposed list and I will apply it.
```

---

## Your prep (human) — before M11

- [ ] Enable Dependabot in repo settings if the builder's config doesn't
      auto-enable it (Settings → Code security).

## Prompt — M11: Longevity

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M11 only** from ROADMAP.md — the final milestone. Hard constraints
unchanged (SPEC.md §1, ROADMAP.md "do not build").

Tasks (ROADMAP.md M11, restated):
1. .github/dependabot.yml: weekly, npm ecosystems for /web and /worker plus
   github-actions; group minor+patch into one PR per ecosystem. CI (from M8) is
   the merge gate — no auto-merge config.
2. Isolate warframe.market access: move every HTTP call + zod parse into
   worker/wfm.ts with a documented header comment listing every endpoint used,
   the shape assumptions, and the rate-limit policy (2.5 req/s, backoff on
   429/503, honor Retry-After if present — add that if missing). sweep.ts calls
   only wfm.ts functions. No behavior change; fixtures/tests keep passing.
3. worker/scripts/export.ts: dumps trade_stats, baro_visits, baro_visit_items,
   vault_events to CSV files in ./export/ (streamed, fetchAll-style pagination,
   filename includes date). Document usage in README.
4. README "Quarterly checklist" section per ROADMAP.md M11.4.

After each task state what changed and how you verified it. Finish by running
the full test suites in /web and /worker and pasting the summary.
```

---

## Your prep (human) — before M12

- [ ] Requires M8 complete (tested metrics). Can run before or after M9–M11.
- [ ] Have `worker/.env` available — the seed script writes to the live DB
      (after your review).
- [ ] Skim one wiki Baro visit page (search "Baro Ki'Teer/Trades") so you can
      sanity-check the builder's parsed output against it.
- [ ] For the synthetic dev world (task 4): either run `supabase start` locally
      (Docker) or create a throwaway Supabase project; have its URL + service
      key ready as a separate env file (`worker/.env.dev`). Never reuse prod
      credentials there.

## Prompt — M12: Baro Hold Advisor

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M12 only** from ROADMAP.md. Hard constraints: SPEC.md §1 non-goals
(the advisor is transparent statistics, NOT ML — no model fitting beyond medians
and normalization) and ROADMAP.md "do not build".

Repo context:
- Metric math lives in tested pure functions (web/src/lib/metrics.ts, or
  shared/metrics.ts if M9 is done — check which exists and follow that pattern).
- PostgREST caps queries at 1000 rows: bulk reads use the fetchAll helper in
  web/src/lib/data.ts with deterministic ordering.
- baro_visits has is_special (TennoCon-scale visits, excluded from recurrence);
  baro_visit_items matches item_name to prime_items with nullable item_id.
- trade_stats holds rank-segmented daily medians (mod_rank column; rank 0 is the
  resale basis). Price history currently spans ~90 days and grows daily.
- web/AGENTS.md: read node_modules/next/dist/docs/ before touching Next.js APIs.

Tasks (ROADMAP.md M12, restated):
1. worker/scripts/seed-baro-history.ts — parse the public Baro visit archive
   (wiki "Baro Ki'Teer/Trades" pages, or a maintained community dataset if you
   find one with dates + inventories; state your source). Output a reviewable
   summary FIRST (visit count, date range, items/visit distribution, unmatched
   item-name count and examples); insert into baro_visits/baro_visit_items only
   with --apply. Match names to prime_items case-insensitively; keep unmatched
   rows with null item_id; set is_special for TennoCon-scale visits (>150 items
   or relay match). Never overwrite the worker-recorded visits — upsert keyed on
   arrival date.
2. Recovery-curve + recurrence functions in the metrics module, per ROADMAP.md
   M12.2 and the maturity-stage gates in M12.5, with unit tests: normalization
   against baseline, pooling to a median curve, recovery_days extraction,
   restock_interval from visit indices, the Stage A→B gate (per-mod curve used
   iff that mod has n ≥ 3 covered restocks, pooled otherwise), and the
   insufficient-history path returning a sentinel rather than a number. Build
   the Stage C functions too (baseline drift 90d-vs-365d, TennoCon-window
   detection from special visits) — gated on data availability, returning
   "not yet available" until the archive is long enough.
3. Advisor UI on /baro per ROADMAP.md M12.3–12.6: verdict column
   (BUY & HOLD ~Nd / BUY & FLIP / SKIP) on the Primed-mods table, plus
   profit_per_day and profit_per_ducat columns (default sort: profit_per_ducat,
   all columns sortable), expandable to show the inputs: sell-now profit, hold
   profit, baseline, recovery days, restock risk, and the sample size n with
   its stage label ("generic estimate" / "per-mod estimate, n=4"). When n < 3
   render "insufficient history", never a guessed number. Include the basket
   optimizer (ROADMAP M12.4: greedy by profit_per_ducat under a ducat-wallet
   input — no solver). While the active visit is special (TennoCon), show the
   regime warning line.
4. Synthetic dev world per ROADMAP.md "Synthetic data policy":
   worker/scripts/seed-synthetic.ts generating a deterministic fake dataset
   (~10 mods, scripted restocks, price series with KNOWN recovery shapes and
   known n per mod, including one Stage-A mod, several Stage-B mods, and
   12+ months of data so Stage C activates) into a dev database read from
   worker/.env.dev. Safety interlock: the script creates/requires a dev_marker
   table and refuses to run against any DB lacking it; it must never read
   worker/.env. Add integration-style tests asserting the pipeline recovers
   the scripted ground truth (e.g. "mod S3 → recovery_days 21, n=4, Stage B").
   Verify the advisor UI against this dev DB in all three stage states.

Honesty guardrails: no extrapolation beyond day 42; baselines always from
before the CURRENT visit's arrival; if price data doesn't cover a historical
restock window, that event contributes nothing (no imputation); synthetic rows
must be impossible to insert into production (the dev_marker interlock).

Do not run the wiki seed with --apply — show me the review output and wait.
After each task state what changed and how you verified it. Finish by
hand-verifying one REAL mod end-to-end (chart, baseline, verdict) and one
SYNTHETIC mod against its scripted ground truth.
```

---

## Your prep (human) — before M13

- [ ] Requires M12 complete (curves/baselines) and M7 (Discord webhook secret).
- [ ] Keep the M12 dev database around — the restock-signal acceptance test
      uses it.
- [ ] Know your Mastery Rank (the trade-cap note in alerts uses it as a
      config value).

## Prompt — M13: Position Tracker & Sell Signals

```
Read SPEC.md and ROADMAP.md in full before writing any code. Implement
**Milestone M13 only** from ROADMAP.md. Hard constraints: SPEC.md §1 non-goals
(single user, no auth, no automation of in-game actions — alerts tell the user
to act, nothing acts for them) and ROADMAP.md "do not build".

Repo context:
- M12 exists: shared metrics expose baselines, recovery_days, and stage-gated
  curves; the advisor renders on /baro; a synthetic dev database
  (worker/.env.dev + dev_marker interlock) exercises mature states.
- M7 exists: Discord webhook posting from the worker/workflows
  (DISCORD_WEBHOOK_URL).
- M9 (if built): pages are ISR-cached with an on-demand revalidate route and
  REVALIDATE_TOKEN; reuse that token pattern to guard the positions write
  route. If M9 is not built yet, create the same token pattern now for writes.
- PostgREST 1000-row cap: bulk reads use the fetchAll helper.
- web/AGENTS.md: read node_modules/next/dist/docs/ before using Next.js APIs.

Tasks (ROADMAP.md M13, restated):
1. Migration: positions table exactly per ROADMAP.md M13.1 (note
   junk_rate_at_buy and baseline_at_buy are snapshotted at purchase time —
   cost basis must not drift when the live junk rate changes). RLS: anon
   select; no anon writes.
2. Write route: POST/PATCH route handler(s) guarded by the token; the dashboard
   is the only caller. "I bought this" button on advisor BUY rows prefilling
   qty/cost/target (default target 0.95 × baseline_at_buy); /positions page
   with open positions (mark-to-market P/L vs current rank-0 median, days
   held, target, distance-to-target) and a close flow recording actual sale
   price into a realized-P/L log.
3. Sell signals in the worker after each sweep, per ROADMAP.md M13.3: three
   trigger conditions (target hit / recovery_days elapsed / mod restocked in a
   newly recorded visit), one Discord message per position per condition ever
   (persist last alert condition + timestamp on the position row). Restock
   signal takes priority and says why. When >3 positions signal on the same
   sweep, one combined message ranked by P/L with a trade-cap reminder
   (mastery rank from env: MASTERY_RANK).
4. Tests: unit-test the signal-decision function (all three conditions, the
   no-re-alert rule, the combined-message threshold) as a pure function; use
   the synthetic dev DB to run one end-to-end: create position → run sweep →
   assert exactly one alert recorded, run again → assert zero.

After each task state what changed and how you verified it. Do not post to the
real Discord webhook during testing — use a mock/env override and show me the
rendered message content instead.
```
