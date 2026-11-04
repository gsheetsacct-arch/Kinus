-- =============================================================================
-- Kinus — 0060: staff tags through the print queue
--   * print_jobs.staff_items: a staff tag request's people, each with what their tag says
--     ({ name, division, values, copies }, read when it was asked for; values are the staff
--     tag's fields), or blank badges for a division. A camper request leaves it empty and lists
--     its campers in print_job_items, as ever. The queue prints both the same way.
-- =============================================================================

alter table print_jobs add column if not exists staff_items jsonb;
comment on column print_jobs.staff_items is 'Staff tag requests: [{ name, division, values, copies }] (empty for camper requests, which use print_job_items).';
