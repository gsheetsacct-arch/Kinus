-- =============================================================================
-- Kinus — 0021: simpler permissions, and deleting staff for good.
--
-- 1. What someone can do comes from their role alone. role_access says, per role,
--    whether they view, check in & out, or edit; profiles.access_level follows it
--    (set by trigger whenever a role is given), so the policies that read it keep working. People no longer
--    get a level of their own. Each role starts at the level most of its people had.
-- 2. A person can be deleted completely. Records they made (check-ins, print jobs,
--    imports…) stay, with "who" left empty.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role decides the level
-- ---------------------------------------------------------------------------
create table if not exists role_access (
  role         staff_role primary key,
  access_level access_level not null
);
alter table role_access enable row level security;
drop policy if exists role_access_read on role_access;
create policy role_access_read on role_access for select to authenticated using (true);
drop policy if exists role_access_admin on role_access;
create policy role_access_admin on role_access to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update on role_access to authenticated;

-- the level most people in each role already had (ties: the usual one), else the usual one
insert into role_access (role, access_level)
select r.role, coalesce(
  (select p.access_level from profiles p where p.role = r.role
     group by p.access_level
     order by count(*) desc, (p.access_level = r.usual) desc
     limit 1),
  r.usual)
from (values
  ('owner'::staff_role, 'edit'::access_level),
  ('director', 'edit'),
  ('division_head', 'edit'),
  ('head_counselor', 'scan'),
  ('counselor', 'scan'),
  ('scanner', 'scan'),
  ('office', 'view'),
  ('logistics', 'scan')
) as r(role, usual)
on conflict (role) do nothing;
update role_access set access_level = 'edit' where role = 'owner';

create or replace function profiles_level_from_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.access_level := case when new.role = 'owner' then 'edit'::access_level
                           else coalesce((select access_level from role_access where role = new.role), new.access_level) end;
  return new;
end $$;
drop trigger if exists profiles_level_from_role on profiles;
-- on update only: a brand-new account keeps what handle_new_user gave it (someone who
-- signed up uninvited stays view-only until a director sets them up)
create trigger profiles_level_from_role before update of role, access_level on profiles
  for each row execute function profiles_level_from_role();

create or replace function role_access_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set access_level = new.access_level where role = new.role and access_level is distinct from new.access_level;
  return new;
end $$;
drop trigger if exists role_access_apply on role_access;
create trigger role_access_apply after insert or update on role_access
  for each row execute function role_access_apply();

-- everyone now has their role's level
update profiles p set access_level = case when p.role = 'owner' then 'edit'::access_level else ra.access_level end
  from role_access ra where ra.role = p.role and p.access_level is distinct from (case when p.role = 'owner' then 'edit'::access_level else ra.access_level end);

-- ---------------------------------------------------------------------------
-- 2. Deleting a person keeps what they recorded
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select con.conname, con.conrelid::regclass as tbl, a.attname as col
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass and con.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references profiles(id) on delete set null', c.tbl, c.conname, c.col);
  end loop;
end $$;
