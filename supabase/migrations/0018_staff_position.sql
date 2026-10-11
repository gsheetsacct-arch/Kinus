-- =============================================================================
-- Kinus — 0018: a free-text position for each staff member ("Learning head",
-- "Waterfront", "Night watch"), next to the role that decides what they can do in Kinus.
-- Shown in the phone book and on the Staff page; read through the server, like phones.
-- =============================================================================
alter table profiles add column if not exists title text;
alter table profiles drop constraint if exists profiles_title_length;
alter table profiles add constraint profiles_title_length check (title is null or char_length(title) <= 80);
