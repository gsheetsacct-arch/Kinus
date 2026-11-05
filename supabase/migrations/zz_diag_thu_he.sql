-- read-only: Thursday Program - Hebrew records added since yesterday
select c.camper_code, c.first_name || ' ' || c.last_name as name, c.created_at
from campers c join divisions d on d.id = c.division_id join sessions s on s.id = c.session_id and s.is_active
where d.name = 'Thursday Program - Hebrew' and c.archived_at is null and c.created_at > now() - interval '2 days'
order by c.camper_code;
