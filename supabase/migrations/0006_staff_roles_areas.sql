-- =============================================================================
-- Kinus — 0006: simpler staff model
--   one role per person, one area (all of camp, or groups/divisions/bunks),
--   one access level; admin and director merged into "director"; division groups.
-- Existing data is converted.
-- =============================================================================

create type staff_role as enum ('owner', 'director', 'division_head', 'head_counselor', 'counselor', 'scanner', 'office', 'logistics');

-- ---------------------------------------------------------------------------
-- Division groups ("Main camp" = Division 1–3 + Bar Mitzvah Program)
-- ---------------------------------------------------------------------------
create table division_groups (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (session_id, name)
);
alter table divisions add column group_id uuid references division_groups(id) on delete set null;
alter table division_groups enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles: role + level + all-of-camp flag (converted from global_role / scopes)
-- ---------------------------------------------------------------------------
alter table profiles add column role staff_role, add column access_level access_level, add column all_areas boolean not null default false;

update profiles p set
  role = case p.global_role
           when 'owner' then 'owner'
           when 'admin' then 'director'
           when 'director' then 'director'
           when 'logistics' then 'logistics'
           when 'office' then 'office'
           else coalesce((select case max(case s.scope_role when 'division_head' then 4 when 'head_counselor' then 3 when 'counselor' then 2 when 'scanner' then 1 end)
                                   when 4 then 'division_head' when 3 then 'head_counselor' when 2 then 'counselor' when 1 then 'scanner' end
                          from staff_scopes s where s.user_id = p.id)::staff_role, 'counselor')
         end::staff_role,
  access_level = case p.global_role
           when 'owner' then 'edit' when 'admin' then 'edit' when 'director' then 'edit'
           when 'logistics' then 'scan' when 'office' then 'view'
           else coalesce((select case max(case s.access_level when 'edit' then 3 when 'scan' then 2 when 'view' then 1 end)
                                   when 3 then 'edit' when 2 then 'scan' when 1 then 'view' end
                          from staff_scopes s where s.user_id = p.id)::access_level, 'scan')
         end::access_level,
  all_areas = p.global_role in ('owner', 'admin', 'director', 'logistics', 'office');

alter table profiles alter column role set not null, alter column role set default 'counselor',
                     alter column access_level set not null, alter column access_level set default 'scan';

-- field visibility: one list of roles per detail
alter table field_visibility add column roles staff_role[] not null default '{owner,director}';
update field_visibility set roles = array(
  select distinct r from unnest(
    array['owner','director']::staff_role[]
    || case when 'logistics' = any(global_roles) then array['logistics']::staff_role[] else '{}' end
    || case when 'office' = any(global_roles) then array['office']::staff_role[] else '{}' end
    || coalesce((select array_agg(x::text::staff_role) from unnest(scope_roles) x), '{}')
  ) r);

-- ---------------------------------------------------------------------------
-- Drop everything that depends on the old role types, then the types themselves
-- ---------------------------------------------------------------------------
drop policy if exists imports_director_read on imports;
drop policy if exists scopes_admin on staff_scopes;
drop policy if exists scopes_select on staff_scopes;
drop policy if exists print_jobs_select on print_jobs;
drop policy if exists print_jobs_office_update on print_jobs;
drop policy if exists print_items_select on print_job_items;
drop policy if exists audit_admin on audit_log;
drop policy if exists profiles_self_update on profiles;
drop trigger if exists profiles_guard on profiles;

drop function if exists global_level();
drop function if exists my_role();

alter table profiles drop column global_role;
alter table field_visibility drop column global_roles, drop column scope_roles;

-- staff_scopes become areas: a group, a division, or a bunk
alter table staff_scopes drop constraint if exists staff_scopes_user_id_division_id_bunk_id_key;
alter table staff_scopes drop column scope_role, drop column access_level;
alter table staff_scopes add column group_id uuid references division_groups(id) on delete cascade;
alter table staff_scopes alter column division_id drop not null;
-- the old unique key let the same division (no bunk) be given twice, e.g. as head
-- counselor and as division head; the role now lives on the profile, so keep one row
delete from staff_scopes a using staff_scopes b
 where a.user_id = b.user_id and a.division_id = b.division_id
   and a.bunk_id is not distinct from b.bunk_id and a.ctid > b.ctid;
alter table staff_scopes add constraint staff_area_target check (
  (group_id is not null and division_id is null and bunk_id is null) or (group_id is null and division_id is not null));
create unique index staff_area_unique on staff_scopes (user_id,
  coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(bunk_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop type global_role;
drop type scope_role;

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
create or replace function my_role() returns staff_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function my_level() returns access_level
language sql stable security definer set search_path = public as $$
  select case when role = 'owner' then 'edit'::access_level else access_level end from profiles where id = auth.uid() and is_active
$$;

create or replace function has_all_areas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' or all_areas from profiles where id = auth.uid() and is_active), false)
$$;

-- camp-wide setup (imports, sessions, settings, templates): owner, or a director over all of camp
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' or (role = 'director' and all_areas) from profiles where id = auth.uid() and is_active), false)
$$;

-- does one of my areas cover this division/bunk?
create or replace function area_covers(p_division_id uuid, p_bunk_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_all_areas() or exists (
    select 1 from staff_scopes s
    left join divisions d on d.id = p_division_id
    where s.user_id = auth.uid()
      and ( (s.group_id is not null and s.group_id = d.group_id)
         or (s.division_id = p_division_id and (s.bunk_id is null or s.bunk_id is not distinct from p_bunk_id)) )
  )
$$;

create or replace function can_access_camper(p_camper_id uuid, p_needed access_level) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(level_rank(my_level()) >= level_rank(p_needed), false)
     and exists (select 1 from campers c where c.id = p_camper_id and area_covers(c.division_id, c.bunk_id))
$$;

-- division-level access: any area in (or containing) the division
create or replace function can_access_division(p_division_id uuid, p_needed access_level) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(level_rank(my_level()) >= level_rank(p_needed), false)
     and (has_all_areas() or exists (
       select 1 from staff_scopes s left join divisions d on d.id = p_division_id
       where s.user_id = auth.uid() and (s.division_id = p_division_id or (s.group_id is not null and s.group_id = d.group_id))))
$$;

create or replace function can_view_field_group(p_group text, p_camper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from field_visibility fv where fv.field_group = p_group and my_role() = any(fv.roles))
$$;

-- ---------------------------------------------------------------------------
-- Profiles: new-user trigger and guard
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r staff_role := 'counselor';
  lvl access_level;
  everywhere boolean := false;
  bootstrap text;
begin
  select value->>'email' into bootstrap from settings where key = 'bootstrap_owner';
  if bootstrap is not null and lower(new.email) = lower(bootstrap) then
    r := 'owner'; everywhere := true;
  elsif (new.raw_user_meta_data->>'role') is not null then
    r := (new.raw_user_meta_data->>'role')::staff_role;
    everywhere := coalesce((new.raw_user_meta_data->>'all_areas')::boolean, false);
  end if;
  lvl := coalesce((new.raw_user_meta_data->>'access_level')::access_level,
                  case r when 'owner' then 'edit' when 'director' then 'edit' when 'division_head' then 'edit' when 'office' then 'view' else 'scan' end::access_level);
  insert into profiles (id, email, full_name, role, access_level, all_areas)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)), r, lvl, everywhere)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create or replace function profiles_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if (new.role is distinct from old.role or new.access_level is distinct from old.access_level
      or new.all_areas is distinct from old.all_areas or new.is_active is distinct from old.is_active)
     and not is_admin() then
    raise exception 'Only directors over all of camp can change roles or access.' using errcode = '42501';
  end if;
  if old.role = 'owner' and new.role <> 'owner' and my_role() is distinct from 'owner' then
    raise exception 'Only an owner can change an owner.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function profiles_guard();

-- ---------------------------------------------------------------------------
-- Policies (recreated for the new helpers)
-- ---------------------------------------------------------------------------
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy groups_read  on division_groups for select to authenticated using (true);
create policy groups_admin on division_groups for all to authenticated using (is_admin()) with check (is_admin());
create policy imports_director_read on imports for select to authenticated using (my_role() in ('owner', 'director'));
create policy scopes_select on staff_scopes for select to authenticated using (user_id = auth.uid() or my_role() in ('owner', 'director'));
create policy scopes_admin  on staff_scopes for all to authenticated using (is_admin()) with check (is_admin());
create policy print_jobs_select on print_jobs for select to authenticated
  using (requested_by = auth.uid() or my_role() in ('owner', 'director', 'office', 'logistics'));
create policy print_jobs_office_update on print_jobs for update to authenticated
  using (my_role() in ('owner', 'director', 'office')) with check (true);
create policy print_items_select on print_job_items for select to authenticated
  using (exists (select 1 from print_jobs j where j.id = job_id and (j.requested_by = auth.uid() or my_role() in ('owner', 'director', 'office', 'logistics'))));
create policy audit_admin on audit_log for select to authenticated using (my_role() in ('owner', 'director'));

-- corrections and bulk: directors (any area) on campers in their area
create or replace function bulk_attendance(p_camper_ids uuid[], p_event_type attendance_event_type, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid; done int := 0; skipped int := 0;
begin
  if my_role() is distinct from 'owner' and my_role() is distinct from 'director' then
    raise exception 'Only directors can do this.' using errcode = '42501';
  end if;
  if p_event_type = 'correction' then raise exception 'Corrections are made one camper at a time.'; end if;
  foreach cid in array p_camper_ids loop
    begin
      perform record_attendance(cid, p_event_type, 'bulk', p_note);
      done := done + 1;
    exception when sqlstate 'P0001' or sqlstate '42501' then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('done', done, 'skipped', skipped);
end $$;

create or replace function record_attendance(
  p_camper_id uuid, p_event_type attendance_event_type, p_method attendance_method default 'manual', p_note text default null,
  p_occurred_at timestamptz default now(), p_force_status camper_status default null, p_device_label text default null
) returns attendance_events
language plpgsql security definer set search_path = public as $$
declare cur camper_status; nxt camper_status; ev attendance_events;
begin
  if not can_access_camper(p_camper_id, 'scan') then raise exception 'not allowed' using errcode = '42501'; end if;
  select status into cur from campers where id = p_camper_id for update;
  if cur is null then raise exception 'camper not found'; end if;
  nxt := case p_event_type
    when 'arrival'  then case when cur in ('expected','departed','no_show') then 'present'::camper_status end
    when 'leave'    then case when cur = 'present' then 'out'::camper_status end
    when 'return'   then case when cur = 'out' then 'present'::camper_status end
    when 'pickup'   then case when cur in ('present','out') then 'departed'::camper_status end
    when 'no_show'  then case when cur = 'expected' then 'no_show'::camper_status end
    when 'correction' then p_force_status
  end;
  if nxt is null then raise exception 'invalid transition % from %', p_event_type, cur using errcode = 'P0001'; end if;
  if p_event_type = 'correction' and my_role() is distinct from 'owner' and my_role() is distinct from 'director' then
    raise exception 'Only directors can correct check-ins.' using errcode = '42501';
  end if;
  if p_event_type = 'correction' and coalesce(p_note, '') = '' then raise exception 'Corrections need a note saying why.'; end if;
  insert into attendance_events (camper_id, event_type, method, occurred_at, recorded_by, note, resulting_status, device_label)
  values (p_camper_id, p_event_type, p_method, p_occurred_at, auth.uid(), p_note, nxt, p_device_label)
  returning * into ev;
  update campers set status = nxt, last_event_id = ev.id where id = p_camper_id;
  if nxt = 'departed' then
    update buzzer_assignments set released_at = now(), released_by = auth.uid() where camper_id = p_camper_id and released_at is null;
    update campers set current_buzzer_number = null where id = p_camper_id;
  end if;
  return ev;
end $$;

-- sensible defaults for who sees what (owners and directors always)
update field_visibility set roles = array(select distinct unnest(roles || array['owner','director']::staff_role[]));
