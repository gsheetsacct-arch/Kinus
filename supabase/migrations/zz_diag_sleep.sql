\pset pager off
create temp view v as
select c.camper_code, c.source_id, c.first_name || ' ' || c.last_name as name, g.name as camp, d.name as division, b.name as bunk,
       c.source_data ? 'ppa.sleeping_at_the_kinus' as has_key,
       nullif(trim(c.source_data->>'ppa.sleeping_at_the_kinus'), '') as answer,
       c.source_id like 'thursday:%' as thursday
from campers c
left join divisions d on d.id = c.division_id
left join division_groups g on g.id = d.group_id
left join bunks b on b.id = c.bunk_id
where c.session_id = (select id from sessions where is_active) and c.archived_at is null;
select thursday, coalesce(answer, case when has_key then '(empty)' else '(no column: not from the export)' end) as answer, count(*) from v group by 1,2 order by 1,3 desc;
select camp, division, count(*) filter (where answer is null) as empty, count(*) as total from v where not thursday group by 1,2 order by 1,2;
select camper_code, source_id, name, camp, division, bunk, case when has_key then 'empty' else 'no column' end as why from v where answer is null and not thursday order by camp, division, bunk, name;
