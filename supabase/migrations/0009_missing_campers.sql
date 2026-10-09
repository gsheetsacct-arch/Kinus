-- =============================================================================
-- Kinus — 0009: campers who haven't arrived
--   Follow-ups for campers still expected: "coming later" (no check-up flag until a
--   time) and notes like "called mom, on the way". The rules for when a missing camper
--   is flagged live in settings ('missing_rules'). Whoever can check a camper in can
--   also take back a "not coming" (no-show → expected).
-- =============================================================================

create table camper_followups (
  camper_id   uuid primary key references campers(id) on delete cascade,
  until       timestamptz,          -- coming later: don't flag before this
  note        text,
  updated_by  uuid references profiles(id) default auth.uid(),
  updated_at  timestamptz not null default now()
);
alter table camper_followups enable row level security;

create policy followups_select on camper_followups for select to authenticated
  using (camper_id in (select c.id from campers c));
create policy followups_insert on camper_followups for insert to authenticated
  with check (can_access_camper(camper_id, 'scan'));
create policy followups_update on camper_followups for update to authenticated
  using (can_access_camper(camper_id, 'scan')) with check (can_access_camper(camper_id, 'scan'));
create policy followups_delete on camper_followups for delete to authenticated
  using (can_access_camper(camper_id, 'scan'));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table camper_followups;
  end if;
end $$;

insert into settings (key, value) values ('missing_rules', '{"percent": 75, "after_time": null}')
on conflict (key) do nothing;

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
