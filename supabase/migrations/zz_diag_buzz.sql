\pset pager off
\pset format unaligned
\pset fieldsep '|'
select c.current_buzzer_number, c.camper_code, c.first_name, c.last_name, d.name, b.name, c.status, c.archived_at is not null as archived, s.is_active
from campers c left join divisions d on d.id = c.division_id left join bunks b on b.id = c.bunk_id join sessions s on s.id = c.session_id
where c.current_buzzer_number in (164,234,455,676,711,722,783,796)
order by s.is_active desc, c.current_buzzer_number;
select 'ASSIGN', a.buzzer_number, c.first_name, c.last_name, a.released_at from buzzer_assignments a join campers c on c.id = a.camper_id
where a.buzzer_number in (164,234,455,676,711,722,783,796) order by a.buzzer_number, a.assigned_at desc;
rollback;
