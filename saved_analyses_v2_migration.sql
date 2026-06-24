-- ClearRate: saved_analyses v2 — surface fields for the Saved Files menu.
-- Adds a human run reference and a small headline summary so the file list can
-- show client name, CR- reference, rate, and monthly savings without loading the
-- full (large) snapshot for every row. Run in the Supabase SQL editor (clearrate).

alter table public.saved_analyses
  add column if not exists run_ref text,
  add column if not exists summary jsonb;
