-- =============================================================================
-- Kinus — 0044: what klolim can do (needs 0043).
--   * Check in & out, like head counselors (Staff → Roles changes it).
--   * They see the camper details head counselors see.
-- =============================================================================
insert into role_access (role, access_level) values ('kloli', 'scan') on conflict (role) do nothing;
update field_visibility set roles = array_append(roles, 'kloli'::staff_role)
where 'head_counselor'::staff_role = any(roles) and not 'kloli'::staff_role = any(roles);
