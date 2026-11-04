-- =============================================================================
-- Kinus — 0061: a staff member's division on their name tag, set in Kinus
--   * profiles.name_tag_division: what their badge says and which design it gets, set on
--     their staff page. null: as the office staff sheet says ("Division (name tag)" in their
--     registration details); '': none (their division in Kinus). The staff sheet upload never
--     writes it, so a hand-set division stays through the next upload.
-- =============================================================================

alter table profiles add column if not exists name_tag_division text;
comment on column profiles.name_tag_division is 'The division on their name tag, set in Kinus (null: as the staff sheet says; empty: their division in Kinus). Staff uploads leave it.';
