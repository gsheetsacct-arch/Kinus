\pset pager off
select g.name as camp, g.sort_order as camp_order, d.name, d.sort_order, d.created_at, (select count(*) from bunks b where b.division_id = d.id) as bunks, (select count(*) from campers c where c.division_id = d.id and c.archived_at is null) as campers
from divisions d left join division_groups g on g.id = d.group_id
where d.session_id = (select id from sessions where is_active) order by g.sort_order nulls first, d.sort_order, d.name;
