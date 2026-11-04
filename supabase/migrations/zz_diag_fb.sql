\pset pager off
with p as (
  select pr.id, pr.full_name, pr.source_id, pr.role,
    coalesce(nullif(pr.name_tag_division, ''), nullif(trim(pr.details->>'Division (name tag)'), ''),
      (select coalesce(d.name, (select d2.name from divisions d2 where d2.group_id = s.group_id order by d2.sort_order limit 1)) from staff_scopes s left join divisions d on d.id = s.division_id where s.user_id = pr.id limit 1)) as tag,
    pr.name_tag_division is not null as set_in_kinus
  from profiles pr where pr.is_active and pr.login <> 'shared'
)
select coalesce(tag, '(none)') as tag, count(*) as staff, string_agg(full_name, ', ' order by full_name) as who
from p
where tag is null or lower(split_part(tag, ' - ', 1)) not in ('adm','guest','virtual','dismissal','logistics','all access','division 1','division 2','division 3','ohel rally','virtual kinus','french division','hebrew division','thursday program','bar mitzva program','bar mitzvah program','finale','finale team')
group by 1 order by 2 desc;
