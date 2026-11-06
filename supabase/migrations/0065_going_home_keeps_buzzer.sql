-- =============================================================================
-- Kinus — 0065: going home keeps the camper's buzzer number
--   * record_attendance (as in 0029): a final check-out ("gone home") no longer clears the
--     camper's buzzer number. Numbers are given once and printed on their labels; clearing it
--     lost it for good (resetting check-ins doesn't bring it back), and a new one would be
--     given if they came back.
--   * Once: numbers cleared that way are put back, when nobody else has that number now
--     (from the activity log: the camper's last change that took the number off on going home).
-- =============================================================================

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
    -- the buzzer handed back; the camper keeps their number (it's on their printed labels)
    update buzzer_assignments set released_at = now(), released_by = auth.uid() where camper_id = p_camper_id and released_at is null;
  end if;
  return ev;
end $$;

do $$
declare r record;
begin
  for r in
    select distinct on (a.row_id) a.row_id as camper_id, (a.before->>'current_buzzer_number')::int as n
    from audit_log a
    where a.table_name = 'campers' and a.action = 'UPDATE'
      and a.before->>'current_buzzer_number' is not null
      and a.after ? 'current_buzzer_number' and a.after->>'current_buzzer_number' is null
      and a.after->>'status' = 'departed'
    order by a.row_id, a.at desc
  loop
    update campers c set current_buzzer_number = r.n
      where c.id = r.camper_id and c.current_buzzer_number is null
        and not exists (select 1 from campers o where o.session_id = c.session_id and o.id <> c.id and o.current_buzzer_number = r.n);
  end loop;
end $$;
