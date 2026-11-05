-- read-only: camps and divisions now, with camper counts (virtual added)
select coalesce(g.name, '(no camp)') as camp, d.name as division, d.language, count(c.id) filter (where c.archived_at is null) as campers, min(c.camper_code) as first_code, max(c.camper_code) as last_code
from divisions d join sessions s on s.id = d.session_id and s.is_active
left join division_groups g on g.id = d.group_id left join campers c on c.division_id = d.id
group by g.name, g.sort_order, d.name, d.sort_order, d.language order by g.sort_order nulls first, d.sort_order;
select count(*) filter (where division_id is null and archived_at is null) as no_division from campers c join sessions s on s.id = c.session_id and s.is_active;
select c.camper_code, c.first_name || ' ' || c.last_name, d.name, c.created_at from campers c join sessions s on s.id = c.session_id and s.is_active left join divisions d on d.id = c.division_id where c.camper_code in ('1309') ;
