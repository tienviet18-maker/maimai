-- MaiMai Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query).
-- Enable: Authentication → Providers → Anonymous sign-ins (required for hybrid offline-first).

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) users (profile extension of auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  target_weight numeric(6, 2),
  created_at timestamptz not null default now()
);

comment on table public.users is 'MaiMai user profile; id mirrors auth.users.id';

-- ---------------------------------------------------------------------------
-- 2) daily_metrics
-- ---------------------------------------------------------------------------
create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  weight numeric(6, 2),
  water_ml integer not null default 0 check (water_ml >= 0),
  sleep_hours numeric(4, 2) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_metrics_user_date_idx
  on public.daily_metrics (user_id, date desc);

-- ---------------------------------------------------------------------------
-- 3) nutrition_logs
-- ---------------------------------------------------------------------------
create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  total_calories numeric(10, 2) not null default 0,
  protein numeric(10, 2),
  carb numeric(10, 2),
  fat numeric(10, 2),
  fiber numeric(10, 2),
  sodium numeric(10, 2),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists nutrition_logs_user_date_idx
  on public.nutrition_logs (user_id, date desc);

-- ---------------------------------------------------------------------------
-- 4) cycle_logs
-- ---------------------------------------------------------------------------
create table if not exists public.cycle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  is_period_day boolean not null default false,
  symptoms jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists cycle_logs_user_date_idx
  on public.cycle_logs (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Auto-create public.users row when a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.cycle_logs enable row level security;

-- users: auth.uid() = id (this table's PK is the user id)
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "users_delete_own" on public.users;
create policy "users_delete_own"
  on public.users for delete
  using (auth.uid() = id);

-- daily_metrics
drop policy if exists "daily_metrics_select_own" on public.daily_metrics;
create policy "daily_metrics_select_own"
  on public.daily_metrics for select
  using (auth.uid() = user_id);

drop policy if exists "daily_metrics_insert_own" on public.daily_metrics;
create policy "daily_metrics_insert_own"
  on public.daily_metrics for insert
  with check (auth.uid() = user_id);

drop policy if exists "daily_metrics_update_own" on public.daily_metrics;
create policy "daily_metrics_update_own"
  on public.daily_metrics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_metrics_delete_own" on public.daily_metrics;
create policy "daily_metrics_delete_own"
  on public.daily_metrics for delete
  using (auth.uid() = user_id);

-- nutrition_logs
drop policy if exists "nutrition_logs_select_own" on public.nutrition_logs;
create policy "nutrition_logs_select_own"
  on public.nutrition_logs for select
  using (auth.uid() = user_id);

drop policy if exists "nutrition_logs_insert_own" on public.nutrition_logs;
create policy "nutrition_logs_insert_own"
  on public.nutrition_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_logs_update_own" on public.nutrition_logs;
create policy "nutrition_logs_update_own"
  on public.nutrition_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_logs_delete_own" on public.nutrition_logs;
create policy "nutrition_logs_delete_own"
  on public.nutrition_logs for delete
  using (auth.uid() = user_id);

-- cycle_logs
drop policy if exists "cycle_logs_select_own" on public.cycle_logs;
create policy "cycle_logs_select_own"
  on public.cycle_logs for select
  using (auth.uid() = user_id);

drop policy if exists "cycle_logs_insert_own" on public.cycle_logs;
create policy "cycle_logs_insert_own"
  on public.cycle_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "cycle_logs_update_own" on public.cycle_logs;
create policy "cycle_logs_update_own"
  on public.cycle_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cycle_logs_delete_own" on public.cycle_logs;
create policy "cycle_logs_delete_own"
  on public.cycle_logs for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5) notification_prefs + notification_logs (optional cloud audit; privacy-safe)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.users (id) on delete cascade,
  enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  slot_id text,
  tone text,
  context_mode text,
  title text,
  created_at timestamptz not null default now()
);

create index if not exists notification_logs_user_created_idx
  on public.notification_logs (user_id, created_at desc);

alter table public.notification_prefs enable row level security;
alter table public.notification_logs enable row level security;

drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own"
  on public.notification_prefs for select using (auth.uid() = user_id);
drop policy if exists "notification_prefs_upsert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own"
  on public.notification_prefs for insert with check (auth.uid() = user_id);
drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own"
  on public.notification_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notification_logs_select_own" on public.notification_logs;
create policy "notification_logs_select_own"
  on public.notification_logs for select using (auth.uid() = user_id);
drop policy if exists "notification_logs_insert_own" on public.notification_logs;
create policy "notification_logs_insert_own"
  on public.notification_logs for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Schema alignment (safe re-run): ensure daily_metrics columns match the app
-- App payload columns: user_id, date, weight, water_ml, sleep_hours
-- create table if not exists does NOT add missing columns on older tables.
-- ---------------------------------------------------------------------------
alter table public.daily_metrics
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.daily_metrics
  add column if not exists date date;

alter table public.daily_metrics
  add column if not exists weight numeric(6, 2);

alter table public.daily_metrics
  add column if not exists water_ml integer;

alter table public.daily_metrics
  add column if not exists sleep_hours numeric(4, 2);

alter table public.daily_metrics
  add column if not exists created_at timestamptz default now();

-- Backfill defaults for water_ml if null
update public.daily_metrics set water_ml = 0 where water_ml is null;

do $$
begin
  -- unique (user_id, date) required for upsert onConflict
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_metrics_user_id_date_key'
  ) then
    begin
      alter table public.daily_metrics
        add constraint daily_metrics_user_id_date_key unique (user_id, date);
    exception when others then
      raise notice 'Could not add unique(user_id,date): %', SQLERRM;
    end;
  end if;
end $$;

-- Verify in SQL Editor:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'daily_metrics'
-- order by ordinal_position;
