-- =============================================================================
-- Kinus — 0040: staff from the registration export (Staff → Add many → upload the export)
--   * source_id: their id in registration (students.id), so uploading the export again
--     updates the same person instead of adding them twice.
--   * address: home address from the form ({street, city, state, zip, country}).
--   * details: every other answer on their form that had anything in it ({"Date of birth": …}).
--   * Like phone and email these are read only through the server (staff managers, on the
--     person's page): migration 0013 grants staff only a fixed list of profile columns, so
--     new columns stay out of reach without anything more here.
-- =============================================================================
alter table profiles add column if not exists source_id text;
alter table profiles add column if not exists address jsonb;
alter table profiles add column if not exists details jsonb;
create unique index if not exists profiles_source_id_key on profiles (source_id) where source_id is not null;
comment on column profiles.source_id is 'Their id in the registration export (students.id).';
comment on column profiles.details is 'Other answers from their registration form, by question.';
