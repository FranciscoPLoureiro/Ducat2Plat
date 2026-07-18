# Ducat2Plat — Professionalization Roadmap (M7–M11)

SPEC.md defines the product and remains the source of truth for what the tool
*does*. This document defines what separates the current working prototype from a
professional-grade tool, and the milestones to close that gap. Build strictly in
order; each milestone has acceptance criteria. **SPEC.md §1 non-goals still apply.**

## The gap, honestly stated

The prototype works. What it lacks is everything that makes a tool trustworthy
when you're NOT watching it:

1. **It has no URL.** It runs on localhost. A tool you can't open from your phone
   at Maroo's Bazaar doesn't exist.
2. **It fails silently.** If the sweep breaks, nothing tells you. You find out
   days later from a staleness banner you have to go look at.
3. **The data has no safety net.** The accumulated price archive is the project's
   only durable asset (SPEC §1) and there are zero backups on a free tier with no
   point-in-time recovery.
4. **The money-math has zero tests.** PpD@6, velocity, junk rate, ROI — the
   numbers the user trades real currency on — are verified by nothing but eyeballs.
   Two of the four have already shipped broken once (ROI division bug, row-cap
   truncation).
5. **Ingestion trusts the API blindly.** `any`-typed parsing of a third-party API
   that can change shape without notice, with no data-quality validation between
   "API responded" and "database updated."
6. **Every page recomputes everything.** Data changes once per day; pages
   recompute rankings from raw rows on every request, and `/baro` runs the entire
   ranking query twice (once for the page, once inside `computeJunkRate`).

## What "professional grade" does NOT mean here (do not build)

- ❌ No auth/user accounts — it's a single-operator tool behind an unguessable URL
  at most.
- ❌ No paid infrastructure. Free tiers (Vercel, Supabase, GHA) are a design
  constraint, not a limitation to outgrow.
- ❌ No microservices, queues, k8s, or "real-time" websockets. One worker, one DB,
  one site.
- ❌ No ML forecasting (SPEC §1 stands).
- ❌ No test coverage theater — test the math and the parsing, not the JSX.

---

## M7 — Deploy & Operate (a tool with a URL that reports its own failures)

1. **Deploy `/web` to Vercel.** Production env vars: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` only (never the service key). Add the
   production URL to README.
2. **Failure alerting.** Add a final `if: failure()` step to the GHA sweep
   workflow that posts to a Discord webhook (secret `DISCORD_WEBHOOK_URL`):
   workflow name, run URL, failed step. Also alert when the sweep *succeeds* but
   `items_failed / items_total > 0.1`.
3. **Weekly backup.** New GHA workflow (weekly cron): `pg_dump` of the Supabase
   database (connection string in secret `SUPABASE_DB_URL`), gzip, upload as a
   GitHub Actions artifact with 90-day retention. Alert on failure via the same
   webhook. Document the restore procedure in README.
4. **Runbook.** README section: architecture diagram (one mermaid block), "sweep
   failed — how to diagnose" (check Actions log → check sweeps table → re-run via
   workflow_dispatch), "how to restore a backup", "how to rotate keys".

✅ Acceptance: site loads from the public URL on a phone; deliberately breaking a
sweep (bad env var, manual dispatch) produces a Discord message within the run;
a backup artifact exists and its restore procedure has been executed once against
a scratch Supabase project.

## M8 — Correctness Hardening (test the money-math, validate the ingestion)

1. **Extract pure functions.** Move all metric math out of `web/src/lib/data.ts`
   into `web/src/lib/metrics.ts` with no I/O: `computePpdAtN(orders, ducats, n)`,
   `computeVelocity(volumeRows, windowDays)`, `computeJunkRateFromRanked(items)`,
   `computeBaroRoi(resale, ducatCost, junkRate)`, `isSpecialVisit(...)`. The data
   layer calls these; nothing else changes.
2. **Unit tests (vitest).** Cover each pure function including the edge cases that
   already bit us: order-book walk across quantity boundaries, shallow books,
   empty inputs, sparse-volume velocity, junk-rate fallback, ROI sign. Also test
   `fetchAll` pagination logic with a mocked page function (exact-multiple-of-1000
   boundary).
3. **Zod-validate API responses in the worker.** Schemas for the four
   warframe.market payloads + warframestat voidTrader. On schema failure: log the
   item, count it as failed, continue — never write a malformed row. Replace all
   `any` in `worker/sweep.ts`.
4. **Data-quality gate in the sweep.** Before closing a sweep, assert: ducats of
   junk items ∈ {15,25,45,65,100}; medians > 0; stats row count within 0.5×–2× of
   the previous sweep's. On violation, close the sweep with a `notes` warning and
   fire the Discord alert.
5. **CI.** GHA workflow on PR + push to main: `npm ci`, ESLint, `tsc --noEmit`,
   vitest, `next build` for `/web`; tsc for `/worker`. Badge in README.

✅ Acceptance: CI green on main; ≥ 25 unit tests passing; introducing a deliberate
off-by-one in `computePpdAtN` fails a test; feeding the worker a fixture with a
missing field logs a failure without inserting rows.

## M9 — Performance & Cost (compute once per day, not once per request)

1. **Precompute rankings in the worker.** After closing a sweep, the worker
   computes the full ranked list (reusing the same pure functions — move
   `metrics.ts` to a shared location imported by both worker and web, e.g.
   `shared/metrics.ts` with a path alias) and writes it to a `rankings` table:
   `(sweep_id, item_id, rank, ppd, ppd_at_n, velocity, score, shallow, orders_json)`.
   Web's `getRankedItems` becomes a single indexed read. Junk rate gets computed
   once and stored on the `sweeps` row — deleting the duplicate query on `/baro`.
2. **Cache pages.** Replace `force-dynamic` with ISR (`revalidate = 3600`) plus
   **on-demand revalidation**: the worker's final step calls a Next.js revalidate
   route (secret token) so pages refresh within seconds of a completed sweep.
   Result: Supabase sees ~one page-build's worth of queries per day instead of
   every visitor re-running everything.
3. **Retention verification.** The sweep already deletes old `order_snapshots`;
   add old `rankings` rows (keep last 30 sweeps) and log table row-counts into the
   sweep `notes` so growth is visible in one place.

✅ Acceptance: `/` TTFB served from cache (check `x-vercel-cache` / equivalent
header); a manual sweep run updates the deployed page within a minute; Supabase
query count per page view is ≤ 2 (staleness + nothing else on cache hit).

## M10 — Product Completeness (the missing halves of SPEC §6)

1. **Seed `vault_events`.** One-off script (checked into `/worker/scripts`)
   sourcing current vault status per prime item (wiki or a maintained JSON list);
   manual review of the output before insert. Item-detail and Primed-mod charts
   render vault markers (chart code already supports reference lines).
2. **Ducat shopping-list planner (SPEC §6.6).** On `/`: inputs for "ducats I
   have" and "ducats I need" (persist in localStorage); output = cheapest
   in-game path to the shortfall using PpD@6 + bundles, grouped by seller, with
   copy-to-clipboard `/w <seller>` whisper text per trade. This is the single
   highest-daily-value missing feature.
3. **Rank-10 resale toggle** on the Baro Primed-mods table (rank-0 remains the
   ROI basis per SPEC; rank-10 shown for information).
4. **UX pass.** Mobile layout for all four pages (the phone-at-the-relay use
   case); loading/error boundaries per page; page `<title>`s; footer with
   warframe.market attribution and a "not affiliated with Digital Extremes" line;
   descriptive `User-Agent` (project URL + contact) on every worker request.

✅ Acceptance: planner produces a correct shopping list against live data
(hand-check one bundle); site is usable on a 375px viewport; worker requests
identify themselves; vault markers visible on at least one currently-vaulted
item's chart.

## M11 — Longevity (the tool survives neglect)

1. **Dependabot** (or Renovate): weekly, grouped minor/patch updates; CI is the
   merge gate.
2. **API v2 readiness.** Isolate all warframe.market HTTP calls + parsing in one
   worker module (`worker/wfm.ts`) so a v1→v2 migration touches one file. Document
   current endpoint/shape assumptions there.
3. **Data export.** A `worker/scripts/export.ts` that dumps `trade_stats` +
   `baro_*` to CSV/Parquet — the archive outlives any one hosting choice.
4. **Quarterly checklist** in README: rotate keys, verify a backup restores,
   check Supabase storage %, check GHA minutes usage.

✅ Acceptance: dependabot PR merged with CI green at least once; export script
produces a loadable CSV; README checklist exists.

---

## M12 — Baro Hold Advisor (what to buy, when to sell)

Turns the passive ROI column into a recommendation: for each Primed mod in the
current visit — buy or skip, expected sell price, and how long to hold to get it.
Requires M8 (tested pure functions); benefits from M9 (shared metrics). All math
is transparent statistics — the SPEC §1 no-ML rule stands.

1. **Seed the historical Baro visit archive.** Baro's full visit history (dates,
   relay, complete inventory with ducat/credit prices) is publicly recorded (wiki
   "Baro Ki'Teer/Trades" pages and community datasets). One-off script
   `worker/scripts/seed-baro-history.ts` with reviewable output before `--apply`
   (same pattern as the vault seeder): insert past `baro_visits` +
   `baro_visit_items`, matching names to `prime_items` case-insensitively,
   keeping unmatched rows with null item_id. Flag TennoCon-scale visits
   `is_special` on the way in. This single task makes recurrence stats real
   ("last seen 9 visits ago, median interval 11 visits") and gives every price
   chart its true restock markers.
2. **Post-visit recovery curve** (in `shared/metrics.ts`, unit-tested):
   - For each (mod, restock event) pair where price data covers the window:
     baseline = median rank-0 price over the 30 days *before* arrival; series =
     daily price for 0–42 days after departure, normalized by baseline.
   - Pool all pairs into one median recovery curve C(t) (per-mod curves are too
     thin at 90 days of price history; pooling across mods is the honest
     estimator — revisit per-tier curves once the archive spans 6+ months).
   - Derived per mod: `recovery_days` = first t where C(t) ≥ 0.95, and
     `restock_interval` = median visits between this mod's historical restocks.
3. **Advisor output** on /baro for each Primed mod in the active visit:
   - `sell_now_profit` = current rank-0 median − ducat_cost × junk_rate (exists).
   - `hold_profit` = 0.95 × pre-visit baseline − ducat_cost × junk_rate.
   - `hold_days` = pooled recovery_days.
   - `restock_risk`: flag when this mod's median restock interval (in days) is
     shorter than recovery_days — a restock during recovery resets the price.
   - `profit_per_day` = (hold_profit − sell_now_profit) / hold_days — capital
     efficiency; a +6p/10d hold beats a +10p/30d hold.
   - `profit_per_ducat` = max(sell_now_profit, hold_profit) / ducat_cost — the
     ranking that matters when the ducat wallet can't cover the whole visit.
   - Verdict column: BUY & HOLD (~Nd) / BUY & FLIP / SKIP, default-ranked by
     profit_per_ducat, sortable by any column, with the numbers shown so the
     user can disagree.
   - Credits column stays informational (credit costs are farmable, not plat).
4. **Basket optimizer.** Input: ducat wallet (reuse the planner's input).
   Greedy fill by profit_per_ducat until the wallet is spent; output the
   suggested basket with expected total profit (flip vs. held) and total credit
   cost. Greedy is deliberate — transparent and within 2% of optimal for this
   problem size; do not build a solver.
5. **Maturity stages — build all gates now; data flips them, not code changes.**
   Every curve-derived number carries its sample size n and resolves through
   this ladder:
   - **Stage A (per-mod n < 3):** the mod uses the pooled all-mods curve,
     labeled "generic estimate".
   - **Stage B (per-mod n ≥ 3):** the mod uses its own curve — its own climb
     rate and recovery_days — labeled "per-mod estimate (n=…)". This is where
     "which mods climb faster" becomes answerable per-mod; unlocks naturally
     over the first ~6 months of visits.
   - **Stage C (price archive ≥ 12 months):** two archive-only features switch
     on: (a) **baseline drift** — compare 90-day vs 365-day baseline per mod and
     flag structural decline/growth > 20% on charts and in the advisor (catches
     "this mod's weapon class got nerfed, the old baseline will never return");
     (b) **TennoCon seasonality** — the special-visit archive knows when the
     annual full-catalog flood happens; in the ~6 weeks before it, the advisor
     warns that hoard values historically dip into the event.
6. **Honesty constraints (encode, don't hide):** show sample size behind every
   curve-derived number (n restock events); when n < 3 display "insufficient
   history" instead of a fabricated hold estimate; label the current TennoCon
   visit's numbers as regime-distorted (everything restocked at once — baselines
   from before the flood, recovery likely slower than the pooled curve).

✅ Acceptance: seeded archive shows plausible recurrence ("Primed Chamber: 2
visits ever" vs common mods every ~10 visits — spot-check 3 mods against the
wiki); advisor renders for the active visit with verdicts and sample sizes;
metrics functions have unit tests including the insufficient-history path;
hand-check one mod's baseline and hold_profit against its own chart.

---

## M13 — Position Tracker & Sell Signals (close the loop)

The advisor says "buy and hold ~20 days" — this milestone makes the system
remember what you bought and tell you when to sell, instead of you re-deriving
it from charts. Requires M12 (uses its baselines/curves) and M7 (Discord
webhook). Single-user by design — no auth (SPEC §1 stands); positions live in
one table.

1. **Schema.** `positions` table: id, item_id, qty, cost_ducats, cost_credits,
   junk_rate_at_buy numeric, baseline_at_buy numeric, target_price numeric,
   acquired_at, status ('open'|'closed'), closed_price, closed_at. Default
   target_price = 0.95 × baseline_at_buy (editable). RLS: anon read; writes go
   through a Next.js route handler guarded by the M9 token (the dashboard is
   the only writer).
2. **Capture flow.** On the advisor table, each BUY row gets an "I bought this"
   button → prefilled form (qty, cost auto-filled from ducat_cost ×
   current junk rate) → insert. A /positions page lists open positions with
   mark-to-market P/L (current rank-0 median vs cost) and a close flow that
   records the actual sale price (realized P/L log below).
3. **Sell signals in the worker.** After each sweep, for every open position:
   if current median ≥ target_price, OR days-held ≥ that mod's recovery_days,
   OR the mod appears in a newly-recorded Baro visit (restock — price will
   crater, sell signal fires with a "restocked!" reason), post ONE Discord
   message per position per condition (record last_alerted_at + reason on the
   position; never re-alert the same condition daily).
4. **Honesty constraints:** mark-to-market uses the daily median — actual fills
   differ, show "est."; when multiple positions signal the same day, the
   message notes the daily trade cap (MR trades/day) so the user prioritizes by
   P/L; a restock signal overrides a hold recommendation (supply beats curve).

✅ Acceptance: buying a mod via the advisor creates a position; manually setting
target_price below current median produces exactly one Discord alert on the
next sweep and none on the sweep after; closing a position records realized
P/L; the restock signal fires when a held mod is inserted into a new visit
(testable by inserting a synthetic visit row in a dev database).

---

## M14 — Professional Polish (trust, context, and signal-to-noise)

Findings from the 2026-07-19 full product walkthrough. Theme: the math is right
but the tool doesn't tell the user how fresh, how confident, or how to read it.
Ordered by value:

1. **Data freshness, always visible.** Every page shows "Data: sweep #N, X h
   ago" (small, in the nav or under the title) — not just the 36h staleness
   banner. Actionable views (planner, bundles, ranking order lists) add one
   line: "listings are up to a day old — confirm the seller is still in-game."
   A pro tool never lets the user mistake stale for live.
2. **Fix the Baro countdown.** It computes latest-arrival + 14d, which the
   off-cadence TennoCon visit skews. The warframestat voidTrader endpoint
   always returns the NEXT activation time even between visits — the worker
   stores it (e.g. on heartbeat), the widget reads it. Show the date, not just
   "7d": "Baro: Fri Jul 24 (5d)". Put the widget in the nav so every page has
   it.
3. **Explain the numbers.** Column-header tooltips (title attr is fine) for
   PpD, PpD@6, Velocity, Score, Depth, ROI, verdicts; a collapsible "How to
   read this" box per page (2–4 sentences each); advisor verdict glossary.
   Zero new data — pure comprehension.
4. **Bundles page polish**: 1-decimal PpD (missed in M10); per-seller
   "Copy /w" whisper button (planner already has one — reuse); link seller
   names to warframe.market/profile/<name>; default view top 50 by combined
   PpD with a min-total-ducats filter (default 135) to cut the 2-item noise
   tail.
5. **Between-visits Baro page** (12 of 14 days it's just history+charts):
   add a "Next visit prep" panel — next arrival date/time, ducat planner
   link, and a recovery watchlist: each Primed mod's current price as % of
   baseline ("Primed Reach 78% — still recovering from TennoCon flood; not
   yet sell-priced"). Honest data, no prediction.
6. **Visit history de-noising**: default filter to Primed mods + tradeables
   (cosmetics toggle off); "Last Seen: Now" → actual label ("current visit"
   while active, else the visit date).
7. **Local settings** (localStorage, no backend): Mastery Rank (drives a
   "this plan uses N of your ~MR daily trades" line in planner/bundles),
   default min-velocity, default ducat target. Worker keeps its MASTERY_RANK
   env for Discord.
8. **Positions upgrades**: portfolio summary row (total cost / current /
   unrealized P/L); edit target_price on an open position; Discord signal
   messages link to /positions.

✅ Acceptance: every page shows sweep age; countdown shows a date sourced from
the API; each metric column has a tooltip; bundles have working whisper copy;
/baro shows the prep panel when Baro is absent; planner shows the trade-cap
line once MR is set.

---

## Sequencing rationale

M7 first because unreported failure invalidates everything else — a perfectly
tested tool that silently stopped sweeping two weeks ago is worse than useless,
it's confidently wrong. M8 before M9 because precomputing rankings (M9) reuses the
pure functions M8 extracts, and you don't optimize unverified math. M10 is
deliberately late: features added to an unreliable base get rebuilt. M11 is cheap
insurance done last.

M12 slots anywhere after M8 — it's the highest-value *feature* on this list, but
it trades on trust in the numbers, which is exactly what M7/M8 establish. M13
requires M12 and M7. If features matter more to you than infrastructure polish,
the honest fast path is M7 → M8 → M12 → M13, then M9–M11.

## Synthetic data policy (for building M12/M13 before the archive matures)

Real data cannot exercise the mature code paths for months (per-mod Stage B
needs 3+ restocks of the same mod) and has no known ground truth to test
against. Therefore:
- **Unit tests** use hand-written fixtures (already required by M8/M12).
- **M12/M13 development and UI states** use `worker/scripts/seed-synthetic.ts`:
  generates a deterministic fake world (N mods, scripted restock events, price
  series with KNOWN recovery shapes — e.g. "mod S3 recovers to baseline in
  exactly 21 days, n=4") into a **local/dev Supabase only**. The script must
  refuse to run unless the target DB contains a `dev_marker` table — it must be
  impossible to point at production by accident. Assertions like "the pipeline
  reports 21 days and n=4 for S3" validate the whole chain, and the UI can be
  developed against Stage A, B, and C states today.
- **Synthetic rows never enter the production database.** The production
  archive's integrity is the project's core asset; polluting it to test a
  feature would be self-defeating.

Estimated effort: M7 ≈ one session, M8 ≈ two, M9 ≈ one–two, M10 ≈ two, M11 ≈ one,
M12 ≈ two–three (archive seed / curves + advisor / synthetic world + stages),
M13 ≈ one–two.
