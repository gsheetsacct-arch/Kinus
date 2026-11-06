-- read-only: buzzer numbers in the active session: duplicates, highest, archived/other holders
\pset footer off
select count(*) filter (where current_buzzer_number is not null) as numbered, max(current_buzzer_number) as highest,
  count(*) filter (where archived_at is not null and current_buzzer_number is not null) as archived_numbered
from campers c join sessions s on s.id = c.session_id and s.is_active;
select c.current_buzzer_number as n, count(*) as holders, string_agg(c.camper_code || ' ' || coalesce(g.name,'?') || '/' || coalesce(d.name,'?') || case when c.archived_at is not null then ' (archived)' else '' end || ' upd ' || to_char(c.updated_at,'MM-DD HH24:MI'), ' | ') as who
from campers c join sessions s on s.id = c.session_id and s.is_active left join divisions d on d.id = c.division_id left join division_groups g on g.id = d.group_id
where c.current_buzzer_number is not null group by 1 having count(*) > 1 order by 1 limit 80;
select to_char(a.at,'MM-DD HH24:MI') as at, a.source, (a.before->>'current_buzzer_number') as was, (a.after->>'current_buzzer_number') as now, a.after->>'camper_code' as code
from audit_log a where a.table_name = 'campers' and a.at > now() - interval '3 days'
  and (a.before->>'current_buzzer_number') is distinct from (a.after->>'current_buzzer_number') order by a.at desc limit 60;
