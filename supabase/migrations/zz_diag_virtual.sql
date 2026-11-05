-- read-only: the camper asked for, and where "virtual" campers are
select c.camper_code, c.first_name || ' ' || c.last_name as camper, d.name as division, g.name as camp, c.archived_at, c.status, s.name as session, s.is_active
from campers c join sessions s on s.id = c.session_id left join divisions d on d.id = c.division_id left join division_groups g on g.id = d.group_id
where c.last_name ilike '%oirechman%' or c.last_name ilike '%orechman%' or c.first_name ilike '%oirechman%'
order by s.is_active desc, c.last_name;
select d.name as division, g.name as camp, count(c.id) as campers, count(c.id) filter (where c.archived_at is not null) as archived
from divisions d join sessions s on s.id = d.session_id and s.is_active left join division_groups g on g.id = d.group_id left join campers c on c.division_id = d.id
where d.name ilike '%virtual%' or g.name ilike '%virtual%'
group by d.name, g.name;
select i.id, i.status, i.uploaded_at from imports i order by i.uploaded_at desc limit 3;
