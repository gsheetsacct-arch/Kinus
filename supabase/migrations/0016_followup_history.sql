-- =============================================================================
-- Kinus — 0016: a follow-up note ("called mom, flight lands at 3") is kept in the
-- camper's timeline when they arrive or are marked not coming, instead of vanishing.
-- Works for every way that happens: the gate's scan, a counselor's card, Not here yet.
-- =============================================================================

create or replace function attendance_keep_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare f camper_followups;
begin
  if new.event_type not in ('arrival', 'no_show') then return new; end if;
  delete from camper_followups where camper_id = new.camper_id returning * into f;
  if f.note is not null and f.note <> '' then
    new.note := case
      when new.note is null or new.note = '' or new.note = 'Not coming' then 'Follow-up: ' || f.note
      when position(f.note in new.note) > 0 then new.note
      else new.note || ' · follow-up: ' || f.note
    end;
  end if;
  return new;
end $$;

drop trigger if exists attendance_events_keep_followup on attendance_events;
create trigger attendance_events_keep_followup before insert on attendance_events
  for each row execute function attendance_keep_followup();
