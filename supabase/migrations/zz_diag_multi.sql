\pset pager off
with p as (select id, full_name, source_id, role, email, details->>'Division (name tag)' as tag, lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) as k from profiles where is_active and login <> 'shared')
select p.full_name, count(*) over (partition by p.k) as records, p.source_id, p.role, p.tag,
  (select string_agg(coalesce(d.name, g.name), ', ') from staff_scopes s left join divisions d on d.id = s.division_id left join division_groups g on g.id = s.group_id where s.user_id = p.id) as areas,
  case when p.email like '%@%' and p.email not like '%placeholder%' and p.email not like '%.invalid' then 'email' else '' end as signs
from p where p.k in (select k from p group by k having count(*) > 1) order by p.k, p.source_id;
