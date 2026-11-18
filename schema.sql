-- Stack — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query),
-- after creating the project with:
--   Region: Americas
--   Enable Data API: ON
--   Automatically expose new tables: OFF
--   Enable automatic RLS: ON
-- This file matches those settings: RLS is enabled on every table and
-- access is granted explicitly, per user, below.
-- No data is seeded here. Stack starts completely empty.

-- Enable pgcrypto for gen_random_uuid() on older projects (no-op on new ones)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables (all owned by one user each via user_id)
-- ---------------------------------------------------------------------------

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  label text not null default '',
  amount numeric(12, 2) not null default 0,
  kind text not null default 'expense' check (kind in ('expense', 'investment')),
  category text not null default 'Other',
  created_at timestamptz not null default now()
);

create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null default 0,
  source text not null default 'Not tracked',
  note text not null default '',
  -- date_known=false means the earning date was not tracked. Such income
  -- counts toward YTD and all-time totals, but NOT toward a specific
  -- month's Income / Kept (the app shows "— / income dates not tracked").
  date_known boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_gains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null default 0,
  note text not null default '',
  is_estimate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('spend_cap', 'save_for', 'invest_by')),
  title text not null default '',
  target_amount numeric(12, 2) not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null default 'monthly',
  period_label text not null default '',
  generated_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_start_value numeric(12, 2),
  month_start_date date,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — ON for every table, per-user policies only.
-- A user can only ever see, add, change, or delete their own rows.
-- ---------------------------------------------------------------------------

alter table public.expenses enable row level security;
alter table public.incomes enable row level security;
alter table public.daily_gains enable row level security;
alter table public.goals enable row level security;
alter table public.reports enable row level security;
alter table public.settings enable row level security;

-- Expenses
drop policy if exists "own expenses select" on public.expenses;
create policy "own expenses select" on public.expenses
  for select using (auth.uid() = user_id);
drop policy if exists "own expenses insert" on public.expenses;
create policy "own expenses insert" on public.expenses
  for insert with check (auth.uid() = user_id);
drop policy if exists "own expenses update" on public.expenses;
create policy "own expenses update" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own expenses delete" on public.expenses;
create policy "own expenses delete" on public.expenses
  for delete using (auth.uid() = user_id);

-- Incomes
drop policy if exists "own incomes select" on public.incomes;
create policy "own incomes select" on public.incomes
  for select using (auth.uid() = user_id);
drop policy if exists "own incomes insert" on public.incomes;
create policy "own incomes insert" on public.incomes
  for insert with check (auth.uid() = user_id);
drop policy if exists "own incomes update" on public.incomes;
create policy "own incomes update" on public.incomes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own incomes delete" on public.incomes;
create policy "own incomes delete" on public.incomes
  for delete using (auth.uid() = user_id);

-- Daily gains
drop policy if exists "own gains select" on public.daily_gains;
create policy "own gains select" on public.daily_gains
  for select using (auth.uid() = user_id);
drop policy if exists "own gains insert" on public.daily_gains;
create policy "own gains insert" on public.daily_gains
  for insert with check (auth.uid() = user_id);
drop policy if exists "own gains update" on public.daily_gains;
create policy "own gains update" on public.daily_gains
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own gains delete" on public.daily_gains;
create policy "own gains delete" on public.daily_gains
  for delete using (auth.uid() = user_id);

-- Goals
drop policy if exists "own goals select" on public.goals;
create policy "own goals select" on public.goals
  for select using (auth.uid() = user_id);
drop policy if exists "own goals insert" on public.goals;
create policy "own goals insert" on public.goals
  for insert with check (auth.uid() = user_id);
drop policy if exists "own goals update" on public.goals;
create policy "own goals update" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own goals delete" on public.goals;
create policy "own goals delete" on public.goals
  for delete using (auth.uid() = user_id);

-- Reports
drop policy if exists "own reports select" on public.reports;
create policy "own reports select" on public.reports
  for select using (auth.uid() = user_id);
drop policy if exists "own reports insert" on public.reports;
create policy "own reports insert" on public.reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "own reports delete" on public.reports;
create policy "own reports delete" on public.reports
  for delete using (auth.uid() = user_id);

-- Settings
drop policy if exists "own settings select" on public.settings;
create policy "own settings select" on public.settings
  for select using (auth.uid() = user_id);
drop policy if exists "own settings insert" on public.settings;
create policy "own settings insert" on public.settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "own settings update" on public.settings;
create policy "own settings update" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own settings delete" on public.settings;
create policy "own settings delete" on public.settings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants: the authenticated role may use the Data API on these tables.
-- RLS above still limits every row to its owner. The anon role gets no
-- direct table access; it only goes through Supabase Auth.
-- (With "Automatically expose new tables" OFF, these grants are required.)
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.incomes to authenticated;
grant select, insert, update, delete on public.daily_gains to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
revoke all on public.expenses, public.incomes, public.daily_gains,
  public.goals, public.reports, public.settings from anon;
