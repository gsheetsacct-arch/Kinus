-- =============================================================================
-- Kinus — 0028: how many of each label a camper gets.
--
-- Some labels are needed two or three times per camper (luggage, bedding…). A template
-- says how many by default; batches, requests from a camper card, automatic prints at
-- first check-in and "print the new ones" use it. It can still be changed when asking or
-- printing.
-- =============================================================================
alter table print_templates add column if not exists copies smallint not null default 1;
alter table print_templates drop constraint if exists print_templates_copies_range;
alter table print_templates add constraint print_templates_copies_range check (copies between 1 and 10);
