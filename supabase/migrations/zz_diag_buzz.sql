-- read-only: buzzer numbers in the active session: duplicates, highest, archived/other holders
\pset footer off
select count(*) filter (where current_buzzer_number is not null) as numbered, max(current_buzzer_number) as highest,
  count(*) filter (where archived_at is not null and current_buzzer_number is not null) as archived_numbered
from campers c join sessions s on s.id = c.session_id and s.is_active;
select c.current_buzzer_number as n, count(*) as holders, string_agg(c.camper_code || ' ' || coalesce(g.name,'?') || '/' || coalesce(d.name,'?') || case when c.archived_at is not null then ' (archived)' else '' end || ' upd ' || to_char(c.updated_at,'MM-DD HH24:MI'), ' | ') as who
from campers c join sessions s on s.id = c.session_id and s.is_active left join divisions d on d.id = c.division_id left join division_groups g on g.id = d.group_id
where c.current_buzzer_number is not null group by 1 having count(*) > 1 order by 1 limit 80;
select a.created_at, a.action, left(a.details::text, 300) from audit_log a where a.created_at > now() - interval '2 days' and (a.details::text ilike '%buzzer%' or a.action ilike '%buzzer%') order by a.created_at desc limit 20;
