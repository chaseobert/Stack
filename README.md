# Stack — build your stack of spending, income, and investing, all in one place

Stack is a free personal finance app for a small group (3–10 friends/family).
No charges, no paywall, no ads. Each person makes their own account and only
ever sees their own spending, income, and investing.

**This folder is the standalone website code. It is NOT published yet.**
Publishing it takes the steps below. Nothing here costs money if you stay on
the free tiers and never add a custom domain.

## What Stack does

- 6 tabs: Overview, Spending, Portfolio, Income, Goals, Reports
- Sign-up / log-in with email + password (Supabase Auth)
- Spending: expenses + investment transfers kept separate; totals for total /
  ex-investments / invested / gas, by week / month / quarter / 6 months /
  12 months / YTD
- Income: every inflow with a source (paycheck, tips, birthday, etc.)
- Portfolio: log each day's gain/loss, monthly totals, You-vs-benchmarks
  (VOO, Dow, Nasdaq, QQQ) fetched on demand from Yahoo Finance — see the
  limitation note in the app: Yahoo often blocks direct browser requests
  (CORS), so the fetch may fail. The app says so honestly and invents no
  numbers. Your own % gain never depends on that fetch.
- Overview: Kept = income − spending ex-investments, with the invested /
  cash-left split, YTD totals, all-time profit/loss, month-by-month table.
  Income whose earning date was not tracked counts toward YTD/all-time but
  NOT toward a specific month — that month shows "— / income dates not tracked".
- Goals: spend less than $X, save $X for [blank], have $X invested by a date,
  with live progress, plus a Coach that suggests goals from your own numbers
  (no external AI call).
- Reports: weekly / monthly / 3-month / 6-month / 12-month, saved in-app,
  openable, printable / Save as PDF from the browser. Reports are not emailed.
- Starts completely empty. No sample data, no Chase data.

## Files in this folder

| File | What it is |
|---|---|
| `index.html` | The whole app page (tabs, forms, tables) |
| `styles.css` | All styling, mobile-friendly, print-friendly |
| `app.js` | All app logic — auth, data, totals, benchmarks, coach, reports |
| `config.js` | Supabase URL + anon key the live site reads (placeholders — fill in yours) |
| `.env.example` | Placeholder names only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — no real values |
| `supabase/schema.sql` | Database tables + Row Level Security. Run this once in Supabase. |
| `README.md` | This file |

No build step is needed. Cloudflare Pages serves these files as-is.

## Publish it — exact steps (do them in this order)

### 1. You already have the accounts (free, no card)
- GitHub — https://github.com/signup
- Supabase — https://supabase.com/dashboard/sign-up
- Cloudflare — https://dash.cloudflare.com/sign-up
Make GitHub first if you haven't already — you can sign up to Supabase with it.

### 2. Make a GitHub repo called `stack`
1. On GitHub, click **+ → New repository**.
2. Repository name: `stack`. Keep it **Public** (Cloudflare Pages Free can
   deploy a public repo; a private repo also works if you connect it).
3. Do NOT add a README / .gitignore / licence in GitHub — the files here
   already include a README.
4. Upload these files: on the new repo page, click **uploading an existing
   file** (or **Add file → Upload files**) and drag in everything from this
   `standalone/` folder, keeping the `supabase/` subfolder. Commit.

### 3. Create the Supabase project
1. In Supabase, click **New project**. Name it `stack`.
2. Set a strong database password and **write it down somewhere safe**.
   Do not share it in chat.
3. Region: **Americas**.
4. Security:
   - **Enable Data API: ON** (checked)
   - **Automatically expose new tables: OFF** (unchecked — Supabase
     recommends controlling access manually)
   - **Enable automatic RLS: ON** (checked — this is what keeps each
     user's data private)
5. Click **Create new project** and wait a couple of minutes for it to finish.

### 4. Run the database schema
1. In Supabase, go to **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this folder, copy the whole file, paste
   it into the SQL Editor, and click **Run**.
3. It should succeed with no errors. This creates the tables
   (`expenses`, `incomes`, `daily_gains`, `goals`, `reports`, `settings`),
   turns Row Level Security ON for all of them, and adds per-user policies
   (`auth.uid() = user_id`) so a user can only touch their own rows.

### 5. Get your two Supabase values
In Supabase, go to **Project Settings → API** and copy:
- **Project URL** → this is `VITE_SUPABASE_URL`
- **anon / public key** → this is `VITE_SUPABASE_ANON_KEY`
Use the **anon** key only. Never use the `service_role` key in this app.

### 6. Put those values in two places
a) **In `config.js` in the GitHub repo:** replace `YOUR_SUPABASE_URL` and
   `YOUR_SUPABASE_ANON_KEY` with your real values, and commit the change.
   (The anon key is safe to ship in a web app *because* RLS is on — it
   cannot read anyone else's rows.)
b) **In Cloudflare Pages** (step 7): add the same two as environment
   variables, named exactly `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, for Production.

### 7. Connect Cloudflare Pages to the repo
1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick your GitHub account and the `stack` repo.
3. Project name: `stack`. Framework preset: **None** (static site).
   Build command: leave blank. Build output directory: `/` (the repo root).
4. Add the two environment variables from step 6b, then **Save and Deploy**.
5. Cloudflare gives you a free address like `stack.pages.dev`. That is the
   live site. No custom domain needed — a custom domain would cost ~$10–15/year.

### 8. Test with one user first
1. Open the `stack.pages.dev` link, go to the **Setup** tab, and check it
   says Connected.
2. Sign up with your own email + password. (If Supabase asks you to confirm
   by email, do that, then log in.)
3. Add one expense, one income, and one daily gain. Check Overview, Spending,
   Portfolio, and Income all show them, and Kept makes sense.
4. Log out, sign up with a second test email, and check the second account
   sees **nothing** from the first — empty Overview, empty lists.
5. Only then invite your friends/family (3–10 people max).

## Free-tier limits to know about

- **Cloudflare Pages Free:** no bandwidth charge on the free tier.
  No commercial-use restriction is stated on its Pages product/limits pages
  (third-party comparisons, Sept/Oct 2026) — that is an absence of a ban,
  not a written permission. Cloudflare Free also bars collecting/processing
  credit-card details on-site — Stack never does that (it never charges).
- **Supabase Free:** 2 active projects, 500 MB database per project, 1 GB
  file storage, 5 GB egress/month, 50,000 monthly active users, 500,000 Edge
  Function invocations/month, no automatic backups. **Free projects pause
  after about a week with too little database activity.** Supabase emails
  about a week before a pause and again once it happens; data/settings are
  kept and the project is restored from the dashboard. A few uses a week from
  3–10 people should keep it awake. Pro ($25/month) removes pausing — Stack
  is built to stay free, so manual restores are the accepted trade-off.
- **GitHub Free:** public repos are free.

## If something goes wrong

- **"Not connected" / sign-in fails:** check the Setup tab values, and that
  the Supabase project finished creating (it takes a few minutes).
- **"Could not load your data — did you run schema.sql?"**: run
  `supabase/schema.sql` in the Supabase SQL Editor (step 4).
- **Benchmarks say "fetch failed":** that is Yahoo blocking the browser
  request, not a Stack bug. No numbers are invented. Check that month's
  VOO / DIA / ^IXIC / QQQ return yourself.
- **Site shows "— / income dates not tracked":** that month has income whose
  earning date was not tracked. Edit that income entry and set its real date
  and it will count toward that month.
- **Supabase project paused:** open Supabase, restore it from the dashboard,
  and use the app a few times that week to keep it active.
