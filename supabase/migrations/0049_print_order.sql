-- =============================================================================
-- Kinus — 0049: the order a print request prints in
--   Chosen when asking for a batch (Print a batch → Order): by bunk (division, bunk, last
--   name), by division (division, last name) or by last name. The emailed PDF and the print
--   page use it; the print page can still change it before printing.
-- =============================================================================
alter table public.print_jobs
  add column if not exists print_order text not null default 'bunk'
  check (print_order in ('bunk', 'division', 'name'));
