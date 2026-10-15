-- =============================================================================
-- Kinus — 0030: bunk number fields
--   Two ready-made fields with the new "Hebrew letters / numbers" conversion:
--   the bunk as a number ("Bunk Yud Alef" → 11) and in Hebrew letters (→ יא).
--   Existing fields with these keys are left as they are.
-- =============================================================================
insert into merge_fields (key, label, source_field, transforms, sort_order) values
  ('BUNK_NUMBER',  'Bunk number: Yud Alef → 11',       'bunk', '[{"type":"hebrew_number","to":"number"}]', 10),
  ('BUNK_LETTERS', 'Bunk in Hebrew letters: 11 → יא',  'bunk', '[{"type":"hebrew_number","to":"hebrew"}]', 10)
on conflict (key) do nothing;
