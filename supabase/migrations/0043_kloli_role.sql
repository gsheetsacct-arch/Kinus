-- =============================================================================
-- Kinus — 0043: the Kloli role (between division head and head counselor).
--   A new enum value can't be used in the transaction that adds it, so its access and
--   field visibility are set in 0044.
-- =============================================================================
alter type staff_role add value if not exists 'kloli' after 'division_head';
