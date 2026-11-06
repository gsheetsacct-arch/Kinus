-- one-off (asked for, to try final check-out): every camper of the American, French and Hebrew
-- camps who hasn't checked in is checked in now. Undo with Settings → Reset check-ins.
with targets as (
  select c.id from campers c
  join sessions s on s.id = c.session_id and s.is_active
  join divisions d on d.id = c.division_id
  join division_groups g on g.id = d.group_id
  where g.name in ('American', 'French', 'Hebrew') and c.archived_at is null and c.status = 'expected'
), ev as (
  insert into attendance_events (camper_id, event_type, method, occurred_at, recorded_by, note, resulting_status)
  select id, 'arrival', 'bulk', now(), null, 'Test: everyone checked in to try final check-out', 'present' from targets
  returning id, camper_id
)
update campers c set status = 'present', last_event_id = ev.id from ev where c.id = ev.camper_id;
select g.name as camp, c.status, count(*) from campers c join sessions s on s.id = c.session_id and s.is_active
join divisions d on d.id = c.division_id join division_groups g on g.id = d.group_id
where g.name in ('American','French','Hebrew') and c.archived_at is null group by 1,2 order by 1,2;
