-- =============================================================================
-- Kinus — 0055: bunk numbers that continue from camp to camp
--   {{BUNK_CONTINUED}}: the first camp (American) keeps its bunk numbers; the next camp
--   (French) carries on after the first camp's highest bunk, and the next (Hebrew) after
--   that one's highest, instead of each starting again from 1 (lib/print/bunk-continued).
--   An existing field with this key is left as it is.
-- =============================================================================
insert into merge_fields (key, label, source_field, transforms, sort_order) values
  ('BUNK_CONTINUED', 'Bunk number, continuing from camp to camp', 'bunk_continued', '[]', 10)
on conflict (key) do nothing;
