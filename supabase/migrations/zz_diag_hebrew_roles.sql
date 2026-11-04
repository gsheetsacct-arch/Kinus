-- read-only diagnostic (not a migration): roles and positions of the Hebrew camps' staff
with heb as (
  select distinct s.user_id from staff_scopes s
  left join divisions d on d.id = s.division_id
  left join division_groups g on g.id = coalesce(s.group_id, d.group_id)
  where g.name in ('Hebrew', 'Thursday Hebrew') or d.name in ('Hebrew Division', 'Thursday Program - Hebrew')
)
select p.role, coalesce(nullif(p.title, ''), '(none)') as position, coalesce(p.details->>'Division (name tag)', '') as tag_division,
       coalesce(p.details->>'Position (badge)', p.details->>'Position', '') as sheet_position, count(*)
  from profiles p where p.id in (select user_id from heb) and p.is_active
 group by 1, 2, 3, 4 order by 1, 2, 3;
