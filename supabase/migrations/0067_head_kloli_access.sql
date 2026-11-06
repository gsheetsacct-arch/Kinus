-- =============================================================================
-- Kinus — 0067: what head klolim can do (needs 0066): what klolim can (Staff → Roles changes it).
--   * The kloli's level (check in & out by default).
--   * They see the camper details klolim see.
-- =============================================================================
insert into role_access (role, access_level)
select 'head_kloli', coalesce((select access_level from role_access where role = 'kloli'), 'scan')
on conflict (role) do nothing;
update field_visibility set roles = array_append(roles, 'head_kloli'::staff_role)
where 'kloli'::staff_role = any(roles) and not 'head_kloli'::staff_role = any(roles);
