-- ClearRate: saved_analyses table
-- Stores a full input snapshot per client file so an LO can reopen, edit, and reprint.
-- Run this in the Supabase SQL editor (Project: clearrate).

create table if not exists public.saved_analyses (
  id            uuid primary key default gen_random_uuid(),
  lo_user_id    uuid not null references auth.users(id) on delete cascade,
  file_name     text not null,
  borrower_name text,
  snapshot      jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists saved_analyses_lo_user_idx on public.saved_analyses(lo_user_id);
create index if not exists saved_analyses_updated_idx on public.saved_analyses(updated_at desc);

-- Row Level Security: each LO sees only their own files.
alter table public.saved_analyses enable row level security;

drop policy if exists "LOs manage own analyses" on public.saved_analyses;
create policy "LOs manage own analyses"
  on public.saved_analyses
  for all
  using (auth.uid() = lo_user_id)
  with check (auth.uid() = lo_user_id);
