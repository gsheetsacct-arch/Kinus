-- =============================================================================
-- Kinus — 0047: what the Staff role can do (needs 0046): view only, and no camper details
--   beyond the basics (field_visibility leaves it out). Staff → Roles changes it.
-- =============================================================================
insert into role_access (role, access_level) values ('staff', 'view') on conflict (role) do nothing;
