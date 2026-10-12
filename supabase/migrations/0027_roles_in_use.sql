-- =============================================================================
-- Kinus — 0027: roles a camp doesn't use can be removed.
--
-- The roles themselves are built in (the rules that read them depend on them), so
-- removing one hides it: it isn't offered when adding or changing staff. It can be
-- brought back on Staff → Roles. Owner and Director always stay.
-- =============================================================================
alter table role_access add column if not exists enabled boolean not null default true;
update role_access set enabled = true where role in ('owner', 'director') and not enabled;
alter table role_access drop constraint if exists role_access_core_enabled;
alter table role_access add constraint role_access_core_enabled check (enabled or role not in ('owner', 'director'));

-- the server reads roles with the service key (Supabase grants this by default; say it anyway)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on role_access to service_role;
  end if;
end $$;
