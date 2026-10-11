-- =============================================================================
-- Kinus — 0017: counselors' and head counselors' printed lists say where each camper
-- is (here / out / not coming back / not coming), not just who is in the bunk.
-- Only adds the column where it isn't there yet.
-- =============================================================================
update list_presets
   set columns = columns || '["status"]'::jsonb
 where id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')
   and not columns ? 'status';
