-- ClearRate: store the raw LLPA grid on each rate sheet.
-- Base prices + this grid are stored at upload; the engine applies the grid against
-- the REAL borrower (FICO/LTV/cash-out) at analysis time. Run in Supabase (clearrate).

alter table public.rate_sheets
  add column if not exists llpa_grid jsonb;
