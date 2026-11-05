\pset pager off
\pset format unaligned
\pset fieldsep '|'
select g.sort_order, g.name, d.sort_order, d.name, b.name, (select count(*) from campers c where c.bunk_id = b.id and c.archived_at is null)
from divisions d left join division_groups g on g.id = d.group_id left join bunks b on b.division_id = d.id
where d.session_id = (select id from sessions where is_active) order by 1, 3, 5;
