-- ClearRate: app_settings table
-- Singleton row (id = 1) holding org-wide settings. Currently: per-program broker
-- margins (BPS), keyed by base loan type. Set by admins/managers in the Admin
-- portal and applied silently to every analysis — loan officers never see them.
-- Run this in the Supabase SQL editor (Project: clearrate).

create table if not exists public.app_settings (
  id          int primary key default 1,
  margins     jsonb not null default '{"conventional": 0, "fha": 0, "va": 0}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  constraint app_settings_singleton check (id = 1)
);

-- Seed the singleton row so the update/upsert path is normal.
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- Row Level Security: everyone signed in can READ margins (the engine needs them),
-- but only admins can WRITE them.
alter table public.app_settings enable row level security;

drop policy if exists "authenticated can read settings" on public.app_settings;
create policy "authenticated can read settings"
  on public.app_settings
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "admins manage settings" on public.app_settings;
create policy "admins manage settings"
  on public.app_settings
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
