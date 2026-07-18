# Security TODO — pending actions (owner: you)

Items found during the 2026-07-19 bug sweep that only the project owner can
resolve. Delete each section when done.

## 1. Rotate `REVALIDATE_TOKEN` (leaked — treat as public)

Until 2026-07-19 the token was serialized into the page payload of /baro and
/positions (server component passed `process.env.REVALIDATE_TOKEN` as a prop to
client components), so anyone who visited while the Baro advisor was rendered —
or any cache/crawler — may have it. The code leak is fixed, but the old value
must be considered burned.

Steps:
1. Generate a new long random string.
2. Vercel → ducat2-plat → Settings → Environment Variables → replace
   `REVALIDATE_TOKEN` (Production) → redeploy.
3. GitHub → repo Settings → Secrets and variables → Actions → replace
   `REVALIDATE_TOKEN` (used by the sweep's revalidate step).
4. Open https://ducat2-plat.vercel.app/positions on your devices and enter the
   new token in the "Unlock" box (it lives only in that browser's localStorage).

## 2. Decide: `SUPABASE_SERVICE_ROLE_KEY` on Vercel, or no web writes

The /api/positions routes (buy / close) use the service-role client
(`web/src/lib/supabase-admin.ts`), but the key is NOT set on Vercel — so those
writes currently return 500 in production and the M13 buy/close flow has never
worked there. Two options:

- **Option A (make it work):** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel
  (Production, server-side only — it is not `NEXT_PUBLIC_*` so it never reaches
  the browser). This is standard Supabase+Next practice but deviates from
  SPEC §2 ("service key used ONLY by the worker") — if chosen, amend SPEC §2 to
  record the deviation and its scope (route handlers, positions table only).
- **Option B (stay strict):** remove the write routes and record positions some
  other way (e.g., a small worker script you run locally).

If you pick A, test one real "I bought this" → position appears on /positions →
close it. That flow has never been exercised end-to-end in production.

## 3. Rotate the Supabase keys committed to git history

`worker/.env.local` (service-role key, secret key) was committed until
2026-07-16. It was untracked then, but the values remain in git history of the
private repo. Rotation was recommended and may still be pending:

Supabase dashboard → Project Settings → API → rotate/regenerate the service
role + secret keys, then update:
- `worker/.env.local` (local)
- GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY`
- Vercel env (only if you chose Option A above)

Optional afterwards: purge history with `git filter-repo` — with rotation done,
this is cosmetic for a private repo.
