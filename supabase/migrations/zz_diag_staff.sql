\pset pager off
select p.id, p.full_name, p.role, p.title, p.source_id, p.email, p.is_active, p.details,
  (select string_agg(coalesce(d.name, g.name, 'bunk'), ', ') from staff_scopes s left join divisions d on d.id = s.division_id left join division_groups g on g.id = s.group_id where s.user_id = p.id) as areas
from profiles p where p.full_name ilike '%azimov%' or p.full_name ilike '%azimov%';
select count(*) as people, count(distinct lower(regexp_replace(full_name, '\s+', ' ', 'g'))) as distinct_names from profiles where is_active and login <> 'shared';
select lower(full_name) as name, count(*) from profiles where is_active and login <> 'shared' group by 1 having count(*) > 1 order by 2 desc limit 20;
