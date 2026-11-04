\pset pager off
select a.at, a.action, a.source, a.row_id, coalesce(a.before->>'full_name', a.after->>'full_name') as name,
  a.before->>'source_id' as before_id, a.after->>'source_id' as after_id, a.before->>'role' as before_role, a.after->>'role' as after_role,
  (select full_name from profiles where id = a.actor_id) as by
from audit_log a
where a.table_name = 'profiles' and (a.before->>'full_name' ilike '%azimov%' or a.after->>'full_name' ilike '%azimov%' or a.before->>'source_id' in ('KTH87-021','KTH87-330','KTH87-333') or a.after->>'source_id' in ('KTH87-021','KTH87-330','KTH87-333'))
order by a.at;
select id, full_name, source_id, role from profiles where source_id in ('KTH87-021','KTH87-330','KTH87-333');
