\pset pager off
\pset format unaligned
\pset fieldsep '|'
select p.full_name, p.email, p.role, p.login, p.access_level, p.all_areas, p.final_checkout,
  (select string_agg(distinct coalesce(g.name, '?'), ', ') from staff_scopes s
     left join divisions d on d.id = coalesce(s.division_id, (select b.division_id from bunks b where b.id = s.bunk_id))
     left join division_groups g on g.id = coalesce(s.group_id, d.group_id)
   where s.user_id = p.id) as camps
from profiles p
where p.is_active and (p.final_checkout or p.all_areas or p.role = 'owner')
order by p.final_checkout desc, p.role, p.full_name;
rollback;
