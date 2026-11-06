-- =============================================================================
-- Kinus — 0066: the Head kloli role (between division head and kloli).
--   A new enum value can't be used in the transaction that adds it, so its access and
--   field visibility are set in 0067.
-- =============================================================================
alter type staff_role add value if not exists 'head_kloli' after 'division_head';
