-- =============================================================================
-- Kinus — 0046: the Staff role: on the staff list (phone book, lists, texts) with no particular
--   role, for people a list or the registration export doesn't give one. A new enum value
--   can't be used in the transaction that adds it, so its access is set in 0047.
-- =============================================================================
alter type staff_role add value if not exists 'staff' after 'logistics';
