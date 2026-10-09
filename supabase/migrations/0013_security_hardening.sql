-- =============================================================================
-- Kinus — 0013: security hardening (from the logic audit)
--   1. Database functions: nothing is callable by signed-out visitors; the helpers only
--      imports use (restore_fields, ensure_division, ensure_bunk) and the on-hold buzzer
--      functions aren't callable through the API at all. restore_fields could rewrite
--      any row (e.g. make someone owner).
--   2. Campers: sensitive columns (medical, address, notes, the raw export row) can't be
--      read from the table directly; only through campers_visible, which masks them by
--      role and now filters rows itself.
--   3. Change history hides changes to details the person may not see.
--   4. Staff emails and phone numbers aren't readable by everyone.
--   5. New accounts take their role only from server-set app metadata, never from what
--      was typed at sign-up.
--   6. Undo only while you still look after the camper.
-- =============================================================================

-- 1. functions -------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function restore_fields(text, uuid, jsonb) from authenticated;
revoke execute on function ensure_division(uuid, text) from authenticated;
revoke execute on function ensure_bunk(uuid, text) from authenticated;
revoke execute on function assign_buzzer(uuid, integer) from authenticated;
revoke execute on function release_buzzer(uuid) from authenticated;
revoke execute on function request_page(uuid) from authenticated;

-- 2. campers: sensitive columns only through the masking view ---------------------
revoke select on campers from anon, authenticated;
grant select (id, session_id, camper_code, source_id, first_name, last_name, display_name, name_normalized,
              division_id, bunk_id, bunk_locked_by_staff, grade, tshirt_size, bunk_preferences, status,
              last_event_id, current_buzzer_number, in_latest_import, created_at, updated_at, archived_at)
  on campers to authenticated;

-- the view reads the table as its owner (to mask), so it filters rows itself, with the
-- same rule as the campers_select policy
create or replace view campers_visible with (security_invoker = false) as
select
  c.id, c.session_id, c.camper_code, c.source_id, c.first_name, c.last_name,
  c.display_name, c.division_id, c.bunk_id, c.grade, c.tshirt_size, c.bunk_preferences,
  c.status, c.last_event_id, c.current_buzzer_number, c.in_latest_import,
  c.updated_at, c.archived_at,
  case when (select can_view_group('address')) then c.local_address end               as local_address,
  case when (select can_view_group('address')) then c.local_address_cross_streets end as local_address_cross_streets,
  case when (select can_view_group('medical')) then c.medical_notes end               as medical_notes,
  case when (select can_view_group('medical')) then c.allergies end                   as allergies,
  case when (select can_view_group('medical')) then c.has_allergies end               as has_allergies,
  case when (select can_view_group('medical')) then c.has_epipen end                  as has_epipen,
  case when (select can_view_group('medical')) then c.has_medications end             as has_medications,
  case when (select can_view_group('parent_notes')) then c.notes_from_parents end     as notes_from_parents,
  case when (select can_view_group('staff_notes')) then c.staff_notes end             as staff_notes,
  -- a flag counselors can always see, even without medical detail:
  (coalesce(c.has_allergies,false) or coalesce(c.has_epipen,false) or coalesce(c.has_medications,false)) as has_medical_flag
from campers c
where (select my_level_rank()) >= 1
  and ((select has_all_areas()) or c.division_id = any ((select my_whole_divisions())::uuid[]) or c.bunk_id = any ((select my_bunks())::uuid[]));
revoke all on campers_visible from anon;
grant select on campers_visible to authenticated;
revoke all on campers_board from anon;

-- 3. history without hidden details -----------------------------------------------
create or replace function camper_history(p_camper_id uuid)
returns table (at timestamptz, actor_id uuid, source text, action text, diff jsonb)
language sql stable security definer set search_path = public as $$
  select a.at, a.actor_id, a.source, a.action,
         (select coalesce(jsonb_object_agg(d.k, d.v), '{}'::jsonb)
            from jsonb_each(coalesce(a.diff, '{}'::jsonb)) as d(k, v)
           where d.k <> 'source_data'
             and case
                   when d.k in ('medical_notes','allergies','has_allergies','has_epipen','has_medications') then can_view_group('medical')
                   when d.k in ('local_address','local_address_cross_streets') then can_view_group('address')
                   when d.k = 'notes_from_parents' then can_view_group('parent_notes')
                   when d.k = 'staff_notes' then can_view_group('staff_notes')
                   else true
                 end) as diff
  from audit_log a
  where a.table_name in ('campers','camper_contacts')
    and (a.row_id = p_camper_id or (a.after->>'camper_id')::uuid = p_camper_id or (a.before->>'camper_id')::uuid = p_camper_id)
    and (a.table_name <> 'camper_contacts' or can_view_group('contacts'))
    and can_access_camper(p_camper_id, 'view')
  order by a.at desc
$$;

-- 4. staff emails and phones: yourself (through the server) and directors only ------
revoke select on profiles from anon, authenticated;
grant select (id, full_name, role, access_level, all_areas, is_active, created_at) on profiles to authenticated;

-- 5. roles only from server-set metadata --------------------------------------------
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
  -- role and areas only from app metadata, which only the server (service role) can set;
  -- what someone types at sign-up (user metadata) is ignored. Kinus sets access itself
  -- right after creating an account, so a new account starts with nothing.
  elsif (new.raw_app_meta_data->>'role') is not null then
    r := (new.raw_app_meta_data->>'role')::staff_role;
    everywhere := coalesce((new.raw_app_meta_data->>'all_areas')::boolean, false);
  end if;
  lvl := coalesce((new.raw_app_meta_data->>'access_level')::access_level,
                  case when r = 'owner' then 'edit' when (new.raw_app_meta_data->>'role') is null then 'view' when r in ('director', 'division_head') then 'edit' when r = 'office' then 'view' else 'scan' end::access_level);
  insert into profiles (id, email, full_name, role, access_level, all_areas)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_app_meta_data->>'full_name', ''), split_part(new.email, '@', 1)), r, lvl, everywhere)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- 6. undo only while you still look after the camper -------------------------------
create or replace function undo_attendance(p_event_id uuid) returns attendance_events
language plpgsql security definer set search_path = public as $$
declare
  e attendance_events;
  prev camper_status;
  ev attendance_events;
begin
  select * into e from attendance_events where id = p_event_id;
  if e is null then raise exception 'Nothing to undo.'; end if;
  if e.recorded_by is distinct from auth.uid() then raise exception 'You can only undo your own check-ins.' using errcode = '42501'; end if;
  -- and only while you still look after this camper
  if not can_access_camper(e.camper_id, 'scan') then raise exception 'not allowed' using errcode = '42501'; end if;
  if e.event_type = 'correction' then raise exception 'That was already undone.'; end if;
  if e.created_at < now() - interval '30 seconds' then raise exception 'Too late to undo. Ask a director to correct it.'; end if;
  perform 1 from campers where id = e.camper_id and last_event_id = e.id for update;
  if not found then raise exception 'Something else was recorded for this camper since. Ask a director to correct it.'; end if;

  select resulting_status into prev from attendance_events
    where camper_id = e.camper_id and created_at < e.created_at
    order by created_at desc limit 1;
  prev := coalesce(prev, 'expected');

  insert into attendance_events (camper_id, event_type, method, recorded_by, note, resulting_status, corrects_event_id)
  values (e.camper_id, 'correction', e.method, auth.uid(), 'Undo', prev, e.id)
  returning * into ev;
  update campers set status = prev, last_event_id = ev.id where id = e.camper_id;
  return ev;
end $$;
