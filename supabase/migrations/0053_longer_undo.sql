-- =============================================================================
-- Kinus — 0053: undo a check-in from the check-in page's recent list
--   The person who recorded a check-in or out can undo it for 15 minutes (was 30 seconds),
--   still only while it is the camper's latest record: anything recorded for them since
--   (a check-out, another scan) means a director corrects it instead.
-- =============================================================================

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
  if e.created_at < now() - interval '15 minutes' then raise exception 'Too late to undo. Ask a director to correct it.'; end if;
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
