-- =============================================================================
-- Kinus — 0029: final check-out
--   Final check-out (going home at the end of camp) is done for a whole camp at one
--   place. Some check-in logins are given "final check-out": on top of their own
--   division, they may record campers of every division in their camp (American,
--   Hebrew…) as gone home, and undo that, and nothing else. Their other access (who
--   they see in lists, checking in) stays their own division.
-- =============================================================================

alter table profiles add column if not exists final_checkout boolean not null default false;
grant select (final_checkout) on profiles to authenticated;

-- only those who set up access may switch it on (the app does it with the service role)
create or replace function profiles_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if (new.role is distinct from old.role or new.access_level is distinct from old.access_level
      or new.all_areas is distinct from old.all_areas or new.is_active is distinct from old.is_active
      or new.final_checkout is distinct from old.final_checkout)
     and not is_admin() then
    raise exception 'Only directors over all of camp can change roles or access.' using errcode = '42501';
  end if;
  if old.role = 'owner' and new.role <> 'owner' and my_role() is distinct from 'owner' then
    raise exception 'Only an owner can change an owner.' using errcode = '42501';
  end if;
  return new;
end $$;

-- The divisions a final-check-out login covers: every division of the camps its own
-- divisions (or bunks) are in. Empty for everyone else.
create or replace function my_checkout_divisions() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id), '{}') from divisions d
  where exists (select 1 from profiles p where p.id = auth.uid() and p.final_checkout and p.is_active)
    and d.group_id in (
      select d2.group_id from divisions d2 where d2.id = any (my_whole_divisions())
      union
      select d3.group_id from bunks b join divisions d3 on d3.id = b.division_id where b.id = any (my_bunks())
    )
$$;

create or replace function can_final_checkout(p_camper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_level_rank() >= 2
     and exists (select 1 from campers c where c.id = p_camper_id and c.division_id = any (my_checkout_divisions()))
$$;

-- as in 0009, and: going home may also be recorded by a final-check-out login of the camp
create or replace function record_attendance(
  p_camper_id uuid, p_event_type attendance_event_type, p_method attendance_method default 'manual', p_note text default null,
  p_occurred_at timestamptz default now(), p_force_status camper_status default null, p_device_label text default null
) returns attendance_events
language plpgsql security definer set search_path = public as $$
declare cur camper_status; nxt camper_status; ev attendance_events;
begin
  if not (can_access_camper(p_camper_id, 'scan') or (p_event_type = 'pickup' and can_final_checkout(p_camper_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
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
  -- directors correct anything; whoever checks campers in may take back a "not coming"
  if p_event_type = 'correction' and my_role() is distinct from 'owner' and my_role() is distinct from 'director'
     and not (cur = 'no_show' and p_force_status = 'expected') then
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

-- as in 0013, and: a final-check-out login may undo its own "gone home" within 30 seconds
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
  if not (can_access_camper(e.camper_id, 'scan') or (e.event_type = 'pickup' and can_final_checkout(e.camper_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
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
