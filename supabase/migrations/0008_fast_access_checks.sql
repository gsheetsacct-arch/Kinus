-- =============================================================================
-- Kinus — 0008: faster access checks
--   Row-level security ran several lookups (role, level, areas) for every camper
--   row; with ~1,000 campers that added up on every page. The person-specific parts
--   are now computed once per query (wrapped in "(select …)", which Postgres runs
--   once), and each row only compares its division/bunk against them.
--   Same rules as before; tests in supabase/tests/areas.sql cover them.
-- =============================================================================

-- Divisions this person covers whole (directly, or through a camp), and single bunks.
create or replace function my_whole_divisions() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select s.division_id as x from staff_scopes s where s.user_id = auth.uid() and s.division_id is not null and s.bunk_id is null
    union
    select d.id from staff_scopes s join divisions d on d.group_id = s.group_id where s.user_id = auth.uid()
  ) t
$$;

create or replace function my_bunks() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s.bunk_id), '{}') from staff_scopes s where s.user_id = auth.uid() and s.bunk_id is not null
$$;

-- 0 when signed out or deactivated
create or replace function my_level_rank() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(level_rank(my_level()), 0)
$$;

-- Whether this person's role may see a detail group (same for every camper they can see).
create or replace function can_view_group(p_group text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from field_visibility fv where fv.field_group = p_group and my_role() = any(fv.roles))
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
drop policy if exists campers_select on campers;
create policy campers_select on campers for select to authenticated using (
  (select my_level_rank()) >= 1
  and ((select has_all_areas()) or division_id = any ((select my_whole_divisions())::uuid[]) or bunk_id = any ((select my_bunks())::uuid[]))
);

drop policy if exists campers_update on campers;
create policy campers_update on campers for update to authenticated
  using ((select my_level_rank()) >= 3
         and ((select has_all_areas()) or division_id = any ((select my_whole_divisions())::uuid[]) or bunk_id = any ((select my_bunks())::uuid[])))
  with check ((select my_level_rank()) >= 3
         and ((select has_all_areas()) or division_id = any ((select my_whole_divisions())::uuid[]) or bunk_id = any ((select my_bunks())::uuid[])));

-- contacts and check-ins: of campers you can see (campers' own policy applies inside)
drop policy if exists contacts_select on camper_contacts;
create policy contacts_select on camper_contacts for select to authenticated
  using ((select can_view_group('contacts')) and camper_id in (select c.id from campers c));

-- Writing contacts was one "for all" policy, which also granted reading: anyone who could
-- edit a camper saw their contacts even when their role isn't allowed to. Split it.
drop policy if exists contacts_write on camper_contacts;
create policy contacts_insert on camper_contacts for insert to authenticated
  with check ((select can_view_group('contacts')) and can_access_camper(camper_id, 'edit'));
create policy contacts_update on camper_contacts for update to authenticated
  using ((select can_view_group('contacts')) and can_access_camper(camper_id, 'edit'))
  with check ((select can_view_group('contacts')) and can_access_camper(camper_id, 'edit'));
create policy contacts_delete on camper_contacts for delete to authenticated
  using ((select can_view_group('contacts')) and can_access_camper(camper_id, 'edit'));

drop policy if exists attendance_select on attendance_events;
create policy attendance_select on attendance_events for select to authenticated
  using (camper_id in (select c.id from campers c));

-- ---------------------------------------------------------------------------
-- Masked details: decided once per query, not per row
-- ---------------------------------------------------------------------------
create or replace view campers_visible with (security_invoker = true) as
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
from campers c;
