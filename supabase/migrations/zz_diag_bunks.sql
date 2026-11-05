-- read-only: every bunk of the American, French and Hebrew camps, with campers and counselors
\pset format unaligned
\pset fieldsep '\t'
\pset footer off
select '##BUNKS' as tag, g.name as camp, g.sort_order as camp_order, d.name as division, d.sort_order as div_order, b.name as bunk, b.sort_order as bunk_order,
  (select count(*) from campers c where c.bunk_id = b.id and c.archived_at is null) as campers,
  (select count(*) from campers c where c.bunk_id = b.id and c.archived_at is null and c.status <> 'no_show') as coming,
  coalesce((select string_agg(p.full_name || case when coalesce(p.phone,'') <> '' then ' (' || p.phone || ')' else '' end, ' ; ' order by p.full_name)
    from staff_scopes s join profiles p on p.id = s.user_id where s.bunk_id = b.id and p.is_active and coalesce(p.login,'') <> 'shared'), '') as counselors,
  coalesce((select string_agg(distinct p.role::text, ',') from staff_scopes s join profiles p on p.id = s.user_id where s.bunk_id = b.id and p.is_active and coalesce(p.login,'') <> 'shared'), '') as roles
from bunks b join divisions d on d.id = b.division_id join sessions se on se.id = d.session_id and se.is_active
left join division_groups g on g.id = d.group_id
where coalesce(g.name, 'American') in ('American','French','Hebrew')
order by g.sort_order, d.sort_order, b.sort_order, b.name;
select '##NOBUNK' as tag, g.name, d.name, count(*) from campers c join divisions d on d.id = c.division_id join sessions se on se.id = c.session_id and se.is_active left join division_groups g on g.id = d.group_id
where c.bunk_id is null and c.archived_at is null and coalesce(g.name,'American') in ('American','French','Hebrew') group by g.name, d.name;
