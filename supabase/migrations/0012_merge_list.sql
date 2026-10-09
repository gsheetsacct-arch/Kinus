-- =============================================================================
-- Kinus — 0012: a field is on the merge list or not. Only fields on the list are
-- offered in the template editor and go into the data for Publisher; a template that
-- already uses a field keeps printing it. Contact details start off the list.
-- =============================================================================
alter table merge_fields add column if not exists enabled boolean not null default true;

update merge_fields set enabled = false
where key in ('MOTHER_PHONE', 'FATHER_PHONE', 'ADDRESS', 'CROSS_STREETS');
